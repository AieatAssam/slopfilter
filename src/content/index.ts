import { xAdapter } from '@/adapters/x/adapter';
import { collapsePost, restorePost } from '@/content/collapse';
import { attachFeedbackControls } from '@/content/feedback';
import { createTimelineObserver, type TimelineObserverHandle } from '@/content/observer';
import type { Post } from '@/core/post';
import { scorePost } from '@/core/scoring/pipeline';
import type { SignalResult } from '@/core/scoring/types';
import { DEFAULT_THRESHOLDS } from '@/core/scoring/weights';
import { deriveAuthorActivity, scoreBehavioural } from '@/core/signals/behavioural';
import { logger } from '@/shared/logger';
import { isExtensionMessage } from '@/shared/messages';
import { applyAccountOverride, getAccountState } from '@/storage/accounts';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  onSettingsChanged,
  type Settings,
} from '@/storage/settings';
import { themeForPlatform } from './themes';

const seenPosts = new Map<string, Post>();
const SELF_TEST_TIMEOUT_MS = 3_000;
let settings: Settings = DEFAULT_SETTINGS;
let paused = false;
let timelineObserver: TimelineObserverHandle | null = null;
let pageObserver: MutationObserver | null = null;
let timelineContainer: Element | null = null;
let selfTestObserver: MutationObserver | null = null;
let selfTestTimer: number | null = null;
let requestSequence = 0;

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
      recordStats: boolean,
    ) => {
      const stats: { hidden: boolean; reasons: readonly string[] }[] = [];
      for (const { element, post } of batch) {
        if (!recordStats) element.dataset.slopfilterModelProcessed = 'true';
        seenPosts.set(post.id, post);
        const activity = deriveAuthorActivity([...seenPosts.values()], post.author.handle);
        const signal = scoreBehavioural(post, activity, DEFAULT_THRESHOLDS);
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
        const theme = themeForPlatform(xAdapter.platform);
        const attachVisibleFeedback = () => {
          attachFeedbackControls(element, post, {
            breakdown: overridden,
            theme,
          });
        };
        const restoreAndAttachFeedback = () => {
          restorePost(element);
          attachVisibleFeedback();
        };
        stats.push({ hidden: overridden.hidden, reasons: overridden.reasons });
        if (overridden.hidden) {
          collapsePost(element, overridden, theme, restoreAndAttachFeedback);
          const placeholder = element.nextElementSibling;
          if (placeholder instanceof HTMLElement) {
            attachFeedbackControls(placeholder, post, {
              breakdown: overridden,
              theme,
              onWrongCall: restoreAndAttachFeedback,
            });
          }
        } else {
          if (element.dataset.slopfilterCollapsed === 'true') restorePost(element);
          attachVisibleFeedback();
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
    await renderBatch(new Map(), true);
    void modelResultsPromise.then((modelResults) => {
      if (modelResults.size > 0) void renderBatch(modelResults, false).catch(() => undefined);
    });
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
  onSettingsChanged(() => {
    void loadSettings()
      .then((nextSettings) => {
        settings = nextSettings;
      })
      .catch(() => undefined);
  });
  logger.debug('content script loaded');
  startAfterSelfTest();
};

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
