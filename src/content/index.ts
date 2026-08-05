import { xAdapter } from '@/adapters/x/adapter';
import { collapsePost } from '@/content/collapse';
import { createTimelineObserver, type TimelineObserverHandle } from '@/content/observer';
import type { Post } from '@/core/post';
import { scorePost } from '@/core/scoring/pipeline';
import { DEFAULT_THRESHOLDS } from '@/core/scoring/weights';
import { deriveAuthorActivity, scoreBehavioural } from '@/core/signals/behavioural';
import { logger } from '@/shared/logger';
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

const scoreBatch = (batch: readonly { element: HTMLElement; post: Post }[]) => {
  try {
    for (const { element, post } of batch) {
      seenPosts.set(post.id, post);
      const activity = deriveAuthorActivity([...seenPosts.values()], post.author.handle);
      const signal = scoreBehavioural(post, activity, DEFAULT_THRESHOLDS);
      const signals = settings.enabledLayers.behavioural ? [signal] : [];
      const breakdown = scorePost(post, signals, {
        hideThreshold: settings.hideThreshold,
        weights: settings.weights,
      });
      if (breakdown.hidden) collapsePost(element, breakdown, themeForPlatform(xAdapter.platform));
    }
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

void start().catch(() => pauseFiltering());
