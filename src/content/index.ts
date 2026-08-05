import { xAdapter } from '@/adapters/x/adapter';
import { collapsePost } from '@/content/collapse';
import { createTimelineObserver, type TimelineObserverHandle } from '@/content/observer';
import type { Post } from '@/core/post';
import { scorePost } from '@/core/scoring/pipeline';
import { DEFAULT_SCORING_CONFIG, DEFAULT_THRESHOLDS } from '@/core/scoring/weights';
import { deriveAuthorActivity, scoreBehavioural } from '@/core/signals/behavioural';
import { logger } from '@/shared/logger';

const seenPosts = new Map<string, Post>();
let paused = false;
let timelineObserver: TimelineObserverHandle | null = null;
let pageObserver: MutationObserver | null = null;
let timelineContainer: Element | null = null;

const sendSelfTestResult = (ok: boolean, failedSelectorIds: readonly string[]) => {
  try {
    const response = chrome.runtime.sendMessage({ type: 'selftest-result', ok, failedSelectorIds });
    void response.catch(() => undefined);
  } catch {
    // A missing service worker must not make the feed unsafe to process.
  }
};

const pauseFiltering = (failedSelectorIds: readonly string[] = []) => {
  paused = true;
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
      const breakdown = scorePost(post, [signal], DEFAULT_SCORING_CONFIG);
      if (breakdown.hidden) collapsePost(element, breakdown);
    }
  } catch {
    pauseFiltering();
  }
};

const attachTimeline = () => {
  if (paused || timelineObserver) return;
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

try {
  logger.debug('content script loaded');
  const result = xAdapter.selfTest(document);
  if (result.ok) {
    sendSelfTestResult(true, []);
    watchTimeline();
  } else {
    pauseFiltering(result.failedSelectorIds);
  }
} catch {
  pauseFiltering();
}
