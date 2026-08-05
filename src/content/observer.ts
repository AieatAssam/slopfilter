import type { PlatformAdapter } from '@/adapters/types';
import type { Post } from '@/core/post';

export interface TimelineObserverOptions {
  adapter: PlatformAdapter;
  container: Element;
  shouldFilter: () => boolean;
  onBatch: (batch: readonly { element: HTMLElement; post: Post }[]) => void;
}

export interface TimelineObserverHandle {
  stop: () => void;
}

export function createTimelineObserver(options: TimelineObserverOptions): TimelineObserverHandle {
  const pending = new Set<HTMLElement>();
  let queued = false;
  let stopped = false;

  const filteringEnabled = () => {
    try {
      return options.shouldFilter();
    } catch {
      return false;
    }
  };

  const drain = () => {
    queued = false;
    if (stopped || !filteringEnabled()) {
      pending.clear();
      return;
    }

    const batch: { element: HTMLElement; post: Post }[] = [];
    for (const element of pending) {
      pending.delete(element);
      element.dataset.slopfilterProcessed = 'true';
      try {
        const post = options.adapter.extractPost(element);
        if (post) batch.push({ element, post });
      } catch {
        // A malformed post must not abort the rest of the batch.
      }
    }
    if (batch.length === 0) return;
    try {
      options.onBatch(batch);
    } catch {
      // A scoring failure must not escape the observer microtask.
    }
  };

  const collect = () => {
    if (stopped || !filteringEnabled()) return;
    let elements: readonly Element[];
    try {
      elements = options.adapter.findPostElements(options.container);
    } catch {
      return;
    }
    for (const element of elements) {
      if (!(element instanceof HTMLElement) || element.dataset.slopfilterProcessed === 'true')
        continue;
      pending.add(element);
    }
    if (pending.size > 0 && !queued) {
      queued = true;
      queueMicrotask(drain);
    }
  };

  const observer = new MutationObserver(() => {
    try {
      collect();
    } catch {
      // Observer callbacks must never escape into the page.
    }
  });
  observer.observe(options.container, { childList: true, subtree: true });
  collect();

  return {
    stop() {
      stopped = true;
      observer.disconnect();
      pending.clear();
    },
  };
}
