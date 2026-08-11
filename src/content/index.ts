import type { ProfileStats } from '@/adapters/types';
import { xAdapter } from '@/adapters/x/adapter';
import { isPayloadRelayMessage } from '@/adapters/x/payload';
import { collapsePost, restorePost } from '@/content/collapse';
import { attachFeedbackControls } from '@/content/feedback';
import { createTimelineObserver, type TimelineObserverHandle } from '@/content/observer';
import type { Post, PostEngagement } from '@/core/post';
import { scorePost } from '@/core/scoring/pipeline';
import type { ScoreBreakdown, SignalResult } from '@/core/scoring/types';
import { behaviouralThresholds } from '@/core/scoring/weights';
import {
  deriveAuthorActivity,
  deriveAuthorActivityFromCache,
  scoreBehavioural,
} from '@/core/signals/behavioural';
import { logger } from '@/shared/logger';
import { isExtensionMessage } from '@/shared/messages';
import { applyAccountOverride, getAccountState } from '@/storage/accounts';
import { recordSightings, updateAuthorProfile } from '@/storage/authorActivity';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  onSettingsChanged,
  type Settings,
} from '@/storage/settings';
import { applyThemeTokens, observeTheme, themeForPlatform } from './themes';

const seenPosts = new Map<string, Post>();
const lastBreakdowns = new Map<string, ScoreBreakdown>();
const payloadEngagement = new Map<string, PostEngagement>();

// payload_clock: fixture account ages are anchored to FIXTURE_NOW, so any signal that consumes
// account age must take `now` as an argument and tests must pass FIXTURE_NOW. A signal calling
// Date.now() directly drifts as the wall clock moves past the fixture date and eventually flips the
// derived rate across a threshold. In test builds the harness pins `now` via the sf-now URL param.
const nowForAccountAge = (): number => {
  if (__SLOPFILTER_TEST_BUILD__) {
    const pinned = new URLSearchParams(location.search).get('sf-now');
    const parsed = pinned ? Date.parse(pinned) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
};
const SELF_TEST_TIMEOUT_MS = 3_000;
let settings: Settings = DEFAULT_SETTINGS;
let paused = false;
let timelineObserver: TimelineObserverHandle | null = null;
let pageObserver: MutationObserver | null = null;
let timelineContainer: Element | null = null;
let selfTestObserver: MutationObserver | null = null;
let selfTestTimer: number | null = null;
let requestSequence = 0;
let _themeDisconnect: (() => void) | null = null;

// SF-216: exact engagement from the HomeTimeline payload supersedes the compact-count DOM parse.
// Payload numbers are plain integers; keep them keyed by post id so a post scored after the relay
// arrives prefers the exact value. The map holds only numbers, never post text.
const preferExactEngagement = (post: Post): Post => {
  const exact = payloadEngagement.get(post.id);
  if (!exact) return post;
  return {
    ...post,
    engagement: {
      replies: exact.replies ?? post.engagement.replies,
      reposts: exact.reposts ?? post.engagement.reposts,
      likes: exact.likes ?? post.engagement.likes,
      views: exact.views ?? post.engagement.views,
    },
  };
};

// Isolated world listener for the MAIN-world interceptor relay. Origin and shape are both checked;
// anything malformed is dropped without a throw. Only the derived numbers named in the payload
// contract are persisted.
const handlePayloadRelay = async (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  if (!isPayloadRelayMessage(event.data)) return;
  const observedAt = Date.now();
  const writes = event.data.authors.map((author) =>
    updateAuthorProfile(
      author.handle,
      { joinDate: author.accountCreatedAt, postCount: author.totalPosts },
      observedAt,
    ).catch(() => null),
  );
  for (const tweet of event.data.engagement) {
    if (tweet.postId) {
      payloadEngagement.set(tweet.postId, {
        replies: tweet.replies,
        reposts: tweet.reposts,
        likes: tweet.likes,
        views: tweet.views,
      });
    }
  }
  try {
    // The flag is a harness observability hook; the writes above are awaited first so a test that
    // reads the attribute can rely on the activity cache already holding the payload stats.
    await Promise.all(writes);
    document.documentElement.dataset.slopfilterPayloadSeen = 'true';
  } catch {
    // Failing to set the flag must not break anything; the payload already passed through.
  }
};

// Test-build-only observability: fires once a scoring pass has fully rendered its decisions onto
// the DOM. E2E specs gate interactions on this so a decision-changed collapse (pass 2 re-scoring a
// post the first pass left visible) can never land between a locator resolving and its click.
const notifyBatchScored = () => {
  if (!__SLOPFILTER_TEST_BUILD__) return;
  try {
    window.dispatchEvent(new CustomEvent('slopfilter-batch-scored'));
  } catch {
    // Test-only observability must never affect scoring.
  }
};

const requestModelSignals = async (posts: readonly Post[]) => {
  if (posts.length === 0) return new Map<string, readonly SignalResult[]>();
  try {
    const simulateModelFailure =
      __SLOPFILTER_TEST_BUILD__ && new URL(location.href).searchParams.has('model-failure');
    const response = await chrome.runtime.sendMessage({
      type: 'score-batch-request',
      requestId: `content-${requestSequence++}`,
      posts,
      ...(simulateModelFailure ? { simulateModelFailure: true } : {}),
    });
    if (!isExtensionMessage(response) || response.type !== 'score-batch-response') {
      return new Map<string, readonly SignalResult[]>();
    }
    return new Map(response.results.map((result) => [result.postId, result.signals]));
  } catch {
    return new Map<string, readonly SignalResult[]>();
  }
};

const sendSelfTestResult = (ok: boolean, failedSelectorIds: readonly string[]) => {
  try {
    const response = chrome.runtime.sendMessage({ type: 'selftest-result', ok, failedSelectorIds });
    void response.catch(() => undefined);
  } catch {
    // A missing service worker must not make the feed unsafe to process.
  }
};

const clearSelfTestWait = () => {
  selfTestObserver?.disconnect();
  selfTestObserver = null;
  if (selfTestTimer !== null) window.clearTimeout(selfTestTimer);
  selfTestTimer = null;
};

const pauseFiltering = (failedSelectorIds: readonly string[] = []) => {
  paused = true;
  clearSelfTestWait();
  timelineObserver?.stop();
  timelineObserver = null;
  pageObserver?.disconnect();
  pageObserver = null;
  sendSelfTestResult(false, failedSelectorIds);
  logger.warn('filtering paused');
};

let profileStats: ProfileStats | null = null;
let profileStatsRead = false;

// SF-215: sightings persist across sessions; scoring reads the cache. Opportunistic profile stats are
// read once per profile navigation and never on the timeline, so a feed pass adds no DOM reads.
const captureProfileStats = (): ProfileStats | null => {
  if (profileStatsRead) return profileStats;
  profileStatsRead = true;
  try {
    const profile = xAdapter.readProfileStats?.(document) ?? null;
    profileStats =
      profile &&
      profile.handle.length > 0 &&
      (profile.joinDate !== null || profile.postCount !== null)
        ? profile
        : null;
  } catch {
    profileStats = null;
  }
  return profileStats;
};

const recordBatch = async (
  batch: readonly { element: HTMLElement; post: Post }[],
): Promise<Map<string, ReturnType<typeof deriveAuthorActivityFromCache>>> => {
  const sightingsByHandle = new Map<string, { postId: string; timestamp: number }[]>();
  for (const { post } of batch) {
    if (!post.postedAt) continue;
    const timestamp = Date.parse(post.postedAt);
    if (!Number.isFinite(timestamp)) continue;
    const list = sightingsByHandle.get(post.author.handle) ?? [];
    list.push({ postId: post.id, timestamp });
    sightingsByHandle.set(post.author.handle, list);
  }

  const profile = captureProfileStats();
  const now = nowForAccountAge();
  const result = new Map<string, ReturnType<typeof deriveAuthorActivityFromCache>>();
  for (const [handle, sightings] of sightingsByHandle) {
    const profileForHandle =
      profile && profile.handle === handle
        ? { joinDate: profile.joinDate, postCount: profile.postCount }
        : undefined;
    const record = await recordSightings(handle, sightings, profileForHandle);
    result.set(handle, record ? deriveAuthorActivityFromCache(record, now) : null);
  }
  return result;
};

const scoreBatch = async (batch: readonly { element: HTMLElement; post: Post }[]) => {
  try {
    const stored = await chrome.storage.local.get('exclusions');
    const exclusions = new Set(
      Array.isArray(stored.exclusions)
        ? stored.exclusions.filter((value): value is string => typeof value === 'string')
        : [],
    );
    const modelResultsPromise = requestModelSignals(batch.map(({ post }) => post));
    const renderBatch = async (
      modelResults: ReadonlyMap<string, readonly SignalResult[]>,
      activityByHandle: Map<string, ReturnType<typeof deriveAuthorActivityFromCache>> | null,
      recordStats: boolean,
    ) => {
      const stats: { hidden: boolean; reasons: readonly string[] }[] = [];
      for (const { element, post: rawPost } of batch) {
        const post = preferExactEngagement(rawPost);
        if (!recordStats) element.dataset.slopfilterModelProcessed = 'true';
        seenPosts.set(post.id, post);
        const activity =
          activityByHandle?.get(post.author.handle) ??
          deriveAuthorActivity([...seenPosts.values()], post.author.handle);
        const signal = scoreBehavioural(post, activity, behaviouralThresholds(settings));
        const signals = [signal, ...(modelResults.get(post.id) ?? [])].filter(
          (result) => settings.enabledLayers[result.layerId],
        );
        const breakdown =
          post.isAd && settings.hideAds
            ? {
                compositeScore: 1,
                threshold: settings.hideThreshold,
                hidden: true,
                contributions: [],
                reasons: ['advertisement'],
              }
            : scorePost(post, signals, {
                hideThreshold: settings.hideThreshold,
                weights: settings.weights,
              });
        const overridden = exclusions.has(post.id)
          ? { ...breakdown, hidden: false, reasons: [] }
          : applyAccountOverride(post, breakdown, await getAccountState(post.author.handle));
        const previous = lastBreakdowns.get(post.id);
        const decisionChanged = !previous || previous.hidden !== overridden.hidden;
        lastBreakdowns.set(post.id, overridden);
        const theme = themeForPlatform(xAdapter.platform);
        const feedbackOptions = {
          enabledLayers: settings.enabledLayers,
          getBreakdown: () =>
            lastBreakdowns.get(post.id) ?? {
              compositeScore: 0,
              threshold: settings.hideThreshold,
              hidden: false,
              contributions: [],
              reasons: [],
              totalWeight: 0,
              requiredDelta: settings.hideThreshold,
            },
        } as const;
        const attachVisibleFeedback = () => {
          attachFeedbackControls(element, post, {
            breakdown: overridden,
            theme,
            ...feedbackOptions,
          });
        };
        const restoreAndAttachFeedback = () => {
          restorePost(element);
          attachVisibleFeedback();
        };
        stats.push({ hidden: overridden.hidden, reasons: overridden.reasons });
        if (decisionChanged) {
          if (overridden.hidden) {
            collapsePost(element, overridden, theme, restoreAndAttachFeedback);
            const placeholder = element.nextElementSibling;
            if (placeholder instanceof HTMLElement) {
              attachFeedbackControls(placeholder, post, {
                breakdown: overridden,
                theme,
                onWrongCall: restoreAndAttachFeedback,
                ...feedbackOptions,
              });
            }
          } else {
            if (element.dataset.slopfilterCollapsed === 'true') restorePost(element);
            attachVisibleFeedback();
          }
        }
      }
      if (!recordStats) return;
      try {
        const response = chrome.runtime.sendMessage({ type: 'record-stats-batch', entries: stats });
        void response.catch(() => undefined);
      } catch {
        // Stats are optional; a missing service worker must not affect filtering.
      }
    };
    await renderBatch(new Map(), null, true);
    const activityPromise = recordBatch(batch);
    void Promise.all([activityPromise, modelResultsPromise]).then(
      async ([activityByHandle, modelResults]) => {
        try {
          await renderBatch(modelResults, activityByHandle, false);
        } catch {
          // A re-score failure is non-fatal; the first pass already rendered.
        }
        notifyBatchScored();
      },
    );
  } catch {
    pauseFiltering();
  }
};

const startAfterSelfTest = () => {
  const attempt = () => {
    const result = xAdapter.selfTest(document);
    if (!result.ok) return result;
    clearSelfTestWait();
    sendSelfTestResult(true, []);
    watchTimeline();
    return result;
  };

  const initialResult = attempt();
  if (initialResult.ok) return;
  // ponytail: wait only for an empty initial shell; partial markup failures pause immediately.
  if (initialResult.failedSelectorIds.length <= 1) {
    pauseFiltering(initialResult.failedSelectorIds);
    return;
  }
  const root = document.documentElement;
  if (!root) {
    pauseFiltering(xAdapter.selfTest(document).failedSelectorIds);
    return;
  }

  selfTestObserver = new MutationObserver(() => {
    try {
      attempt();
    } catch {
      pauseFiltering();
    }
  });
  selfTestObserver.observe(root, { childList: true, subtree: true });
  selfTestTimer = window.setTimeout(() => {
    const result = attempt();
    if (result.ok) return;
    clearSelfTestWait();
    pauseFiltering(result.failedSelectorIds);
  }, SELF_TEST_TIMEOUT_MS);
};

const attachTimeline = () => {
  if (paused || timelineObserver) return;
  const result = xAdapter.selfTest(document);
  if (!result.ok) {
    pauseFiltering(result.failedSelectorIds);
    return;
  }
  const container = xAdapter.findTimelineContainer(document);
  if (!container) return;
  timelineContainer = container;
  timelineObserver = createTimelineObserver({
    adapter: xAdapter,
    container,
    shouldFilter: () => !paused,
    onBatch: scoreBatch,
  });
};

const watchTimeline = () => {
  attachTimeline();
  const root = document.documentElement;
  if (!root) return;
  pageObserver = new MutationObserver(() => {
    try {
      if (paused) return;
      if (timelineObserver && timelineContainer?.isConnected) return;
      timelineObserver?.stop();
      timelineObserver = null;
      timelineContainer = null;
      attachTimeline();
    } catch {
      pauseFiltering();
    }
  });
  pageObserver.observe(root, { childList: true, subtree: true });
};

const start = async () => {
  try {
    settings = await loadSettings();
  } catch {
    settings = DEFAULT_SETTINGS;
  }
  applyThemeTokens(document);
  _themeDisconnect = observeTheme(document, () => {
    try {
      applyThemeTokens(document);
    } catch {
      // Fail open: a theme sample failure must not pause filtering.
    }
  });
  onSettingsChanged(() => {
    void loadSettings()
      .then((nextSettings) => {
        settings = nextSettings;
      })
      .catch(() => undefined);
  });
  startAfterSelfTest();
};

if (typeof window !== 'undefined') {
  window.addEventListener('message', handlePayloadRelay);
}

if (typeof chrome !== 'undefined') {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtensionMessage(message) || message.type !== 'get-selftest-state') return false;
    const result = xAdapter.selfTest(document);
    sendResponse({
      type: 'selftest-result',
      ok: result.ok,
      failedSelectorIds: result.failedSelectorIds,
    });
    return true;
  });
}

void start().catch(() => pauseFiltering());
