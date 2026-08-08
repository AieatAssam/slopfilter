import { describe, expect, test, vi } from 'vitest';
import type { Post } from '@/core/post';
import { createInferenceHost } from '@/offscreen/offscreen';

const post: Post = {
  id: 'post-1',
  permalink: null,
  text: 'post',
  postedAt: null,
  author: { handle: '@author', displayName: 'Author', profileUrl: null },
  engagement: { replies: null, reposts: null, likes: null, views: null },
  imageUrls: [],
  hasVideo: false,
};

const readyPipelines = {
  scoreBatch: async (posts: readonly Post[]) =>
    posts.map((item) => ({ postId: item.id, signals: [] })),
  embed: async () => new Float32Array([1, 0]),
  downvote: async () => true,
};

describe('inference host readiness', () => {
  test('answers before readiness with an empty result set', async () => {
    const load = () => new Promise<typeof readyPipelines>(() => undefined);
    const host = createInferenceHost({ load });

    await expect(host.scoreBatch([post])).resolves.toEqual([]);
    expect(host.getStatus().state).toBe('downloading');
  });

  test('scores one result per post once ready', async () => {
    const host = createInferenceHost({ load: async () => readyPipelines });
    host.start();
    await vi.waitFor(() => expect(host.getStatus().state).toBe('ready'));

    await expect(host.scoreBatch([post])).resolves.toEqual([{ postId: post.id, signals: [] }]);
  });

  test('latches load failures and keeps callers fail-open', async () => {
    const load = vi.fn(async () => {
      throw new Error('offline');
    });
    const host = createInferenceHost({ load });

    await expect(host.scoreBatch([post])).resolves.toEqual([]);
    await vi.waitFor(() => expect(host.getStatus().state).toBe('failed'));
    await expect(host.scoreBatch([post])).resolves.toEqual([]);
    expect(load).toHaveBeenCalledOnce();
  });
});
