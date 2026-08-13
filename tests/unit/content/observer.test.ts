import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PlatformAdapter } from '@/adapters/types';
import { createTimelineObserver } from '@/content/observer';
import type { Post } from '@/core/post';

const post: Post = {
  id: 'post-1',
  permalink: null,
  text: 'post',
  postedAt: null,
  author: { handle: '@account01', displayName: 'Account 01', profileUrl: null },
  engagement: { replies: null, reposts: null, likes: null, views: null },
  imageUrls: [],
  hasVideo: false,
};

const adapterFor = (extractPost: PlatformAdapter['extractPost'] = () => post): PlatformAdapter => ({
  platform: 'x',
  selectorContractVersion: '1.2.0',
  selfTest: () => ({ ok: true, failedSelectorIds: [] }),
  selfTestFeed: () => ({ ok: true, failedSelectorIds: [] }),
  findTimelineContainer: (root) => root.querySelector('div'),
  findPostElements: (container) => Array.from(container.querySelectorAll('article')),
  extractPost,
});

const setup = (shouldFilter = () => true) => {
  const container = document.createElement('div');
  document.body.append(container);
  const onBatch = vi.fn();
  const handle = createTimelineObserver({
    adapter: adapterFor(),
    container,
    shouldFilter,
    onBatch,
  });
  return { container, handle, onBatch };
};

const addPosts = (container: Element, count: number) => {
  for (let index = 0; index < count; index += 1)
    container.append(document.createElement('article'));
};

describe('createTimelineObserver', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('drains one batch per microtask regardless of mutation count', async () => {
    const { container, handle, onBatch } = setup();
    addPosts(container, 10);

    await Promise.resolve();
    await Promise.resolve();

    expect(onBatch).toHaveBeenCalledOnce();
    expect(onBatch.mock.calls[0]?.[0]).toHaveLength(10);
    handle.stop();
  });

  test('re-observing a processed element does not score it again', async () => {
    const { container, handle, onBatch } = setup();
    const postElement = document.createElement('article');
    container.append(postElement);
    await Promise.resolve();
    await Promise.resolve();

    container.append(postElement);
    await Promise.resolve();
    await Promise.resolve();

    expect(onBatch).toHaveBeenCalledOnce();
    handle.stop();
  });

  test('a failing post does not abort the batch', async () => {
    const failingElement = document.createElement('article');
    const extractPost = vi.fn((element: Element) => {
      if (element === failingElement) throw new Error('bad post');
      return post;
    });
    const container = document.createElement('div');
    document.body.append(container);
    const onBatch = vi.fn();
    const handle = createTimelineObserver({
      adapter: adapterFor(extractPost),
      container,
      shouldFilter: () => true,
      onBatch,
    });
    addPosts(container, 9);
    container.append(failingElement);

    await Promise.resolve();
    await Promise.resolve();

    expect(onBatch).toHaveBeenCalledOnce();
    expect(onBatch.mock.calls[0]?.[0]).toHaveLength(9);
    handle.stop();
  });

  test('does not filter while paused', async () => {
    const { container, handle, onBatch } = setup(() => false);
    addPosts(container, 10);

    await Promise.resolve();
    await Promise.resolve();

    expect(onBatch).not.toHaveBeenCalled();
    handle.stop();
  });

  test('disconnects cleanly and stops emitting batches after stop()', async () => {
    const { container, handle, onBatch } = setup();
    handle.stop();
    addPosts(container, 10);

    await Promise.resolve();
    await Promise.resolve();

    expect(onBatch).not.toHaveBeenCalled();
  });
});
