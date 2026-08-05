import { describe, expect, test } from 'vitest';
import { isPost, type Post } from '@/core/post';

const validPost: Post = {
  id: 'post-1',
  permalink: 'https://example.invalid/post-1',
  text: 'A useful post',
  postedAt: '2026-08-05T10:00:00.000Z',
  author: {
    handle: '@author',
    displayName: 'Author',
    profileUrl: 'https://example.invalid/author',
  },
  engagement: { replies: 1, reposts: 2, likes: 3, views: null },
  imageUrls: ['https://example.invalid/image.jpg'],
  hasVideo: false,
};

describe('isPost', () => {
  test('accepts a fully populated post', () => {
    expect(isPost(validPost)).toBe(true);
  });

  test('rejects a post with no id', () => {
    expect(isPost({ ...validPost, id: undefined } as unknown)).toBe(false);
  });

  test('rejects a post with an empty id', () => {
    expect(isPost({ ...validPost, id: '' })).toBe(false);
  });

  test('rejects a post whose text is not a string', () => {
    expect(isPost({ ...validPost, text: 42 } as unknown)).toBe(false);
  });

  test('rejects a post whose imageUrls is not an array', () => {
    expect(isPost({ ...validPost, imageUrls: 'x' } as unknown)).toBe(false);
  });
});
