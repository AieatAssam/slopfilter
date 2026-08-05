import type { Post } from '@/core/post';

export type ExtensionMessage =
  | { type: 'selftest-result'; ok: boolean; failedSelectorIds: readonly string[] }
  | { type: 'get-selftest-state'; tabId?: number }
  | { type: 'score-batch-request'; requestId: string; posts: readonly Post[] }
  | {
      type: 'score-batch-response';
      requestId: string;
      results: readonly { postId: string; score: number }[];
    }
  | { type: 'downvote-post'; postId: string; text: string }
  | { type: 'wrong-call'; postId: string; firedLayerIds: readonly string[] };

const messageTypes = [
  'selftest-result',
  'get-selftest-state',
  'score-batch-request',
  'score-batch-response',
  'downvote-post',
  'wrong-call',
] as const;

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const type = value.type;
  return typeof type === 'string' && messageTypes.includes(type as (typeof messageTypes)[number]);
}
