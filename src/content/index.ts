import type { ProfileStats } from '@/adapters/types';
import { xAdapter } from '@/adapters/x/adapter';
import { isPayloadRelayMessage } from '@/adapters/x/payload';
import { collapsePost, restorePost } from '@/content/collapse';
import { attachFeedbackControls } from '@/content/feedback';
import { createTimelineObserver, type TimelineObserverHandle } from '@/content/observer';
import type { Post, PostEngagement } from '@/core/post';
import { scorePost } from '@/core/scoring/pipeline';
import type { ScoreBreakdown, SignalResult } from '@/core/scoring/types';
import {
  behaviouralThresholds,
  CONTENT_FORMAT_DEFAULTS,
  REPETITION_DEFAULTS,
} from '@/core/scoring/weights';
import {
  deriveAuthorActivity,
  deriveAuthorActivityFromCache,
  scoreBehavioural,
} from '@/core/signals/behavioural';
import { combineContentType, scoreContentFormat } from '@/core/signals/contentType';
import { type RepetitionCorpusEntry, scoreRepetition, simhash64 } from '@/core/signals/repetition';
import { logger } from '@/shared/logger';
import { isExtensionMessage } from '@/shared/messages';
import { applyAccountOverride, getAccountState } from '@/storage/accounts';
import { recordSightings, updateAuthorProfile } from '@/storage/authorActivity';
import { addCorpusEntry, listCorpusEntries } from '@/storage/embeddings';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  onSettingsChanged,
  type Settings,
} from '@/storage/settings';
import { applyThemeTokens, observeTheme, themeForPlatform } from './themes';

const seenPosts = new Map<string, Post>();
const seenElements = new Map<string, HTMLElement>();
const lastBreakdowns = new Map<string, ScoreBreakdown>();
const payloadEngagement = new Map<string, PostEngagement>();
const scoreGenerations = new Map<string, number>();
const recordedStatsPosts = new Set<string>();
const pendingStatsPosts = new Set<string>();
let rescoreAuthors: ((handles: readonly string[]) => void) | null = null;

// SF-219: the recent-post corpus the repetition signal compares against. It holds vectors and
// hashes only, never post text, and is persisted to IndexedDB with the same cap-and-evict policy as
// the downvote store. The Map keyed by postId mirrors the store so re-scoring a post never
// double-feeds it within a session.
const repetitionCorpus = new Map<string, RepetitionCorpusEntry>();
let repetitionCorpusLoad: Promise<void> | null = null;

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
let lastLocationHref = '';

// SF-216: exact engagement from intercepted X payloads supersedes the compact-count DOM parse.
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
    rescoreAuthors?.(event.data.authors.map((author) => author.handle));
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

const requestModelSignals = async (
  posts: readonly Post[],
): Promise<{
  signalsByPost: Map<string, readonly SignalResult[]>;
  embeddingsByPost: Map<string, Float32Array | null>;
}> => {
  if (posts.length === 0) {
    return { signalsByPost: new Map(), embeddingsByPost: new Map() };
  }
  try {
    const simulateModelFailure =
      __SLOPFILTER_TEST_BUILD__ && new URL(location.href).searchParams.has('model-failure');
    const fixtureEmbeddings =
      __SLOPFILTER_TEST_BUILD__ && new URL(location.href).searchParams.has('fixture-embeddings');
    const fixtureTextPatternMax =
      __SLOPFILTER_TEST_BUILD__ && new URL(location.href).searchParams.has('text-pattern-max');
    const response = await chrome.runtime.sendMessage({
      type: 'score-batch-request',
      requestId: `content-${requestSequence++}`,
      posts,
      textPatternEnabled: settings.enabledLayers['text-pattern'],
      ...(simulateModelFailure ? { simulateModelFailure: true } : {}),
      ...(fixtureEmbeddings ? { fixtureEmbeddings: true } : {}),
      ...(fixtureTextPatternMax ? { fixtureTextPatternMax: true } : {}),
    });
    if (!isExtensionMessage(response) || response.type !== 'score-batch-response') {
      return { signalsByPost: new Map(), embeddingsByPost: new Map() };
    }
    return {
      signalsByPost: new Map(response.results.map((result) => [result.postId, result.signals])),
      embeddingsByPost: new Map(
        response.results.map((result) => [
          result.postId,
          result.embedding && result.embedding.length > 0
            ? Float32Array.from(result.embedding)
            : null,
        ]),
      ),
    };
  } catch {
    return { signalsByPost: new Map(), embeddingsByPost: new Map() };
  }
};

const loadRepetitionCorpus = () => {
  if (repetitionCorpusLoad) return repetitionCorpusLoad;
  repetitionCorpusLoad = (async () => {
    try {
      for (const entry of await listCorpusEntries()) {
        repetitionCorpus.set(entry.postId, entry);
      }
    } catch {
      // Fail open: an unreadable corpus just means the signal compares against an empty store.
    }
    // Test-build-only: the scoring budget is asserted with the corpus at its cap, so the bench can
    // prefill to the cap deterministically without replaying hundreds of real posts. Deterministic,
    // orthogonal vectors and unique hashes keep every entry a non-match.
    const capParam = __SLOPFILTER_TEST_BUILD__
      ? Number(new URL(location.href).searchParams.get('corpus-cap'))
      : 0;
    if (Number.isFinite(capParam) && capParam > repetitionCorpus.size) {
      const dimension = 384;
      let seed = 0;
      while (repetitionCorpus.size < capParam) {
        const postId = `bench-corpus-${seed}`;
        const embedding = new Float32Array(dimension);
        let hash = 0xcbf29ce484222325n;
        for (let index = 0; index < seed; index += 1) {
          hash = ((hash ^ BigInt(index)) * 0x100000001b3n) & 0xffffffffffffffffn;
        }
        for (let dimensionIndex = 0; dimensionIndex < dimension; dimensionIndex += 1) {
          hash = ((hash ^ 0x9e3779b97f4a7c15n) * 0x100000001b3n) & 0xffffffffffffffffn;
          embedding[dimensionIndex] = Number(hash % 1000000000n) / 1000000000;
        }
        const norm =
          Math.sqrt(Array.from(embedding).reduce((sum, value) => sum + value * value, 0)) || 1;
        for (let dimensionIndex = 0; dimensionIndex < dimension; dimensionIndex += 1) {
          const value = embedding[dimensionIndex];
          if (value === undefined) continue;
          embedding[dimensionIndex] = value / norm;
        }
        repetitionCorpus.set(postId, {
          postId,
          handle: `@bench-corpus-${seed}`,
          embedding,
          simhash: BigInt(seed),
          observedAt: seed,
        });
        seed += 1;
      }
    }
  })();
  return repetitionCorpusLoad;
};

// Feed a scored post into the corpus and persist it. The store evicts oldest-first once it exceeds
// the documented cap; the in-memory Map evicts the same way so the two never drift far apart.
const addToRepetitionCorpus = (entry: RepetitionCorpusEntry) => {
  repetitionCorpus.set(entry.postId, entry);
  const cap = REPETITION_DEFAULTS.corpusCap;
  while (repetitionCorpus.size > cap) {
    let oldestId: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [id, candidate] of repetitionCorpus) {
      if (candidate.observedAt < oldestAt) {
        oldestAt = candidate.observedAt;
        oldestId = id;
      }
    }
    if (oldestId === null) break;
    repetitionCorpus.delete(oldestId);
  }
  void addCorpusEntry(entry, cap).catch(() => undefined);
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
let profileStatsPath = '';

// SF-215: sightings persist across sessions; scoring reads the cache. Recheck after SPA navigation
// and keep retrying a route until its profile header has rendered.
const captureProfileStats = (): ProfileStats | null => {
  const path = location.pathname;
  if (profileStatsPath === path && profileStats) return profileStats;
  profileStatsPath = path;
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

const scoreBatch = async (
  batch: readonly { element: HTMLElement; post: Post }[],
  recordVisit = true,
) => {
  const generations = new Map(
    batch.map(({ post }) => {
      const generation = (scoreGenerations.get(post.id) ?? 0) + 1;
      scoreGenerations.set(post.id, generation);
      return [post.id, generation] as const;
    }),
  );
  for (const { element } of batch) delete element.dataset.slopfilterModelProcessed;
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
      embeddingsByPost: ReadonlyMap<string, Float32Array | null>,
      activityByHandle: Map<string, ReturnType<typeof deriveAuthorActivityFromCache>> | null,
      recordStats: boolean,
    ) => {
      const stats: { postId: string; hidden: boolean; reasons: readonly string[] }[] = [];
      for (const { element, post: rawPost } of batch) {
        const post = preferExactEngagement(rawPost);
        seenPosts.set(post.id, post);
        seenElements.set(post.id, element);
        const activity =
          activityByHandle?.get(post.author.handle) ??
          deriveAuthorActivity([...seenPosts.values()], post.author.handle);
        const behaviouralSignal = scoreBehavioural(post, activity, behaviouralThresholds(settings));
        // SF-220: the content-type layer is structural-plus-model. The structural score is always
        // available (no model, no download) and is combined with the centroid result when one
        // exists, taking the stronger of the two so a loaded model never dilutes a confident
        // structural fire. Keeping one contribution avoids double-weighting the layer in scorePost.
        const contentFormatSignal = scoreContentFormat(post.text, CONTENT_FORMAT_DEFAULTS);
        const modelSignals = modelResults.get(post.id) ?? [];
        const modelContentType = modelSignals.find((result) => result.layerId === 'content-type');
        const contentTypeSignal = modelContentType
          ? combineContentType(contentFormatSignal, modelContentType)
          : contentFormatSignal;
        // SF-219: near-duplicate scoring against the corpus this script has already observed. The
        // embedder vector arrives with the batch (computed for taste); the simhash gate and length
        // floor decide whether any embedding work is worth it. A post joins the corpus only once it
        // has a vector, so corpus entries always carry an embedding.
        const textLength = post.text.length;
        const embedding = embeddingsByPost.get(post.id) ?? null;
        const simhash = simhash64(post.text);
        const repetitionSignal = scoreRepetition(
          { handle: post.author.handle, embedding, simhash, textLength },
          [...repetitionCorpus.values()].filter((entry) => entry.postId !== post.id),
          REPETITION_DEFAULTS,
        );
        if (
          embedding &&
          textLength >= REPETITION_DEFAULTS.minTextLength &&
          !repetitionCorpus.has(post.id)
        ) {
          addToRepetitionCorpus({
            postId: post.id,
            handle: post.author.handle,
            embedding,
            simhash,
            observedAt: Date.now(),
          });
        }
        const signals = [
          behaviouralSignal,
          contentTypeSignal,
          repetitionSignal,
          ...modelSignals.filter((result) => result.layerId !== 'content-type'),
        ].filter((result) => settings.enabledLayers[result.layerId]);
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
        if (scoreGenerations.get(post.id) !== generations.get(post.id)) continue;
        const previous = lastBreakdowns.get(post.id);
        const isCollapsed = element.dataset.slopfilterCollapsed === 'true';
        const hasFeedback = Boolean(
          element.querySelector('[data-testid="slopfilter-anchor"]') ||
            element.nextElementSibling?.querySelector('[data-testid="slopfilter-anchor"]'),
        );
        const decisionChanged =
          !previous ||
          previous.hidden !== overridden.hidden ||
          overridden.hidden !== isCollapsed ||
          (!overridden.hidden && !hasFeedback);
        lastBreakdowns.set(post.id, overridden);
        const theme = themeForPlatform(xAdapter.platform);
        const feedbackOptions = {
          enabledLayers: settings.enabledLayers,
          findAnchorHost: (element: HTMLElement) =>
            xAdapter.findPostContentColumn?.(element) ?? null,
          onAccountStateChanged: () => rescoreAuthors?.([post.author.handle]),
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
          scoreGenerations.set(post.id, (scoreGenerations.get(post.id) ?? 0) + 1);
          restorePost(element);
          attachVisibleFeedback();
        };
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
        if (!recordStats) element.dataset.slopfilterModelProcessed = 'true';
        if (!recordedStatsPosts.has(post.id) && !pendingStatsPosts.has(post.id)) {
          pendingStatsPosts.add(post.id);
          stats.push({ postId: post.id, hidden: overridden.hidden, reasons: overridden.reasons });
        }
      }
      if (stats.length === 0) return;
      try {
        const saved = await chrome.runtime.sendMessage({
          type: 'record-stats-batch',
          entries: stats.map(({ hidden, reasons }) => ({ hidden, reasons })),
        });
        if (saved === true) {
          for (const { postId } of stats) recordedStatsPosts.add(postId);
        }
      } catch {
        // Stats are optional; a missing service worker must not affect filtering.
      } finally {
        for (const { postId } of stats) pendingStatsPosts.delete(postId);
      }
    };
    await loadRepetitionCorpus();
    await renderBatch(new Map(), new Map(), null, recordVisit);
    const activityPromise = recordBatch(batch);
    void Promise.all([activityPromise, modelResultsPromise]).then(
      async ([activityByHandle, { signalsByPost, embeddingsByPost }]) => {
        try {
          await renderBatch(signalsByPost, embeddingsByPost, activityByHandle, false);
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

rescoreAuthors = (handles) => {
  const wanted = new Set(handles);
  const batch = [...seenPosts.values()]
    .filter((post) => wanted.has(post.author.handle))
    .map((post) => ({ element: seenElements.get(post.id), post }))
    .filter(
      (entry): entry is { element: HTMLElement; post: Post } => entry.element?.isConnected === true,
    );
  if (batch.length > 0) void scoreBatch(batch, false);
};

const startAfterSelfTest = () => {
  const attachAndStart = () => {
    clearSelfTestWait();
    sendSelfTestResult(true, []);
    watchTimeline();
  };
  const attempt = () => {
    const result = xAdapter.selfTest(document);
    if (result.ok) {
      attachAndStart();
      return result;
    }
    // A non-timeline route (Explore, Notifications, a profile) resolves the feed shell but
    // none of the post-level selectors. That is a wait for posts, not a markup break, so proceed to
    // watch the timeline; the feed-level contract staying healthy is the break signal.
    const feed = xAdapter.selfTestFeed(document);
    if (feed.ok) {
      attachAndStart();
      return { ok: true, failedSelectorIds: [] };
    }
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
  // Attaching must not gate on the full required-selector contract. X is a SPA: navigating
  // away from the home feed (Explore, Notifications, a profile) re-renders the column so the
  // post-level selectors stop resolving, and pausing there kills filtering for the rest of the
  // session because nothing ever re-attaches. A missing timeline container is a wait, not a break:
  // the page observer stays alive and re-attaches when a feed route comes back.
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

const refreshTimeline = () => {
  if (paused) return;
  lastLocationHref = location.href;
  timelineObserver?.stop();
  timelineObserver = null;
  timelineContainer = null;
  for (const element of document.querySelectorAll<HTMLElement>('[data-slopfilter-processed]')) {
    delete element.dataset.slopfilterProcessed;
    delete element.dataset.slopfilterModelProcessed;
  }
  attachTimeline();
};

const watchTimeline = () => {
  attachTimeline();
  lastLocationHref = location.href;
  const root = document.documentElement;
  if (!root) return;
  pageObserver = new MutationObserver(() => {
    try {
      if (paused) return;
      if (location.href !== lastLocationHref) {
        refreshTimeline();
        return;
      }
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

  const announceNavigation = () => window.dispatchEvent(new Event('slopfilter-navigation'));
  const rawPushState = history.pushState.bind(history);
  const rawReplaceState = history.replaceState.bind(history);
  history.pushState = ((...args: Parameters<History['pushState']>) => {
    const result = rawPushState(...args);
    announceNavigation();
    return result;
  }) as History['pushState'];
  history.replaceState = ((...args: Parameters<History['replaceState']>) => {
    const result = rawReplaceState(...args);
    announceNavigation();
    return result;
  }) as History['replaceState'];
  window.addEventListener('popstate', refreshTimeline);
  window.addEventListener('slopfilter-navigation', refreshTimeline);
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
        rescoreAuthors?.([...new Set([...seenPosts.values()].map((post) => post.author.handle))]);
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
