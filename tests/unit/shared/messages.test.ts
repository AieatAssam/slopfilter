import { describe, expect, test } from 'vitest';
import type { Post } from '@/core/post';
import { type ExtensionMessage, isExtensionMessage } from '@/shared/messages';

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

const variantName = (message: ExtensionMessage): string => {
  switch (message.type) {
    case 'selftest-result':
      return message.type;
    case 'get-selftest-state':
      return message.type;
    case 'score-batch-request':
      return message.type;
    case 'score-batch-response':
      return message.type;
    case 'embed-request':
      return message.type;
    case 'embed-response':
      return message.type;
    case 'downvote-complete':
      return message.type;
    case 'model-status-request':
      return message.type;
    case 'model-status':
      return message.type;
    case 'model-retry':
      return message.type;
    case 'downvote-post':
      return message.type;
    case 'wrong-call':
      return message.type;
    case 'record-stats-batch':
      return message.type;
    case 'record-wrong-call':
      return message.type;
    default: {
      const exhaustive: never = message;
      return exhaustive;
    }
  }
};

describe('ExtensionMessage', () => {
  test('covers every variant exhaustively', () => {
    const messages: ExtensionMessage[] = [
      { type: 'selftest-result', ok: true, failedSelectorIds: [] },
      { type: 'get-selftest-state' },
      { type: 'score-batch-request', requestId: 'request-1', posts: [post] },
      {
        type: 'score-batch-response',
        requestId: 'request-1',
        results: [{ postId: post.id, signals: [] }],
      },
      { type: 'embed-request', requestId: 'embed-1', text: post.text },
      { type: 'embed-response', requestId: 'embed-1', vector: null },
      { type: 'downvote-complete', postId: post.id, ok: true },
      { type: 'model-status-request' },
      { type: 'model-status', status: { state: 'idle', progress: 0, error: null } },
      { type: 'model-retry' },
      { type: 'downvote-post', postId: post.id, text: post.text },
      { type: 'wrong-call', postId: post.id, firedLayerIds: [] },
      { type: 'record-stats-batch', entries: [] },
      { type: 'record-wrong-call', reasonIds: [] },
    ];

    expect(messages.map(variantName)).toEqual(messages.map(({ type }) => type));
  });

  test('isExtensionMessage rejects an unknown type', () => {
    expect(isExtensionMessage({ type: 'not-a-real-message' })).toBe(false);
    expect(isExtensionMessage(null)).toBe(false);
  });
});
