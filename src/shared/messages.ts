import type { Post } from '@/core/post';
import type { SignalResult } from '@/core/scoring/types';

export type ModelState = 'idle' | 'downloading' | 'ready' | 'failed';

export interface ModelStatus {
  state: ModelState;
  progress: number;
  error: string | null;
}

export type ExtensionMessage =
  | { type: 'selftest-result'; ok: boolean; failedSelectorIds: readonly string[] }
  | { type: 'offscreen-ready' }
  | { type: 'get-selftest-state'; tabId?: number }
  | {
      type: 'score-batch-request';
      requestId: string;
      posts: readonly Post[];
      simulateModelFailure?: boolean;
    }
  | {
      type: 'score-batch-response';
      requestId: string;
      results: readonly { postId: string; signals: readonly SignalResult[] }[];
    }
  | { type: 'embed-request'; requestId: string; text: string }
  | { type: 'embed-response'; requestId: string; vector: readonly number[] | null }
  | { type: 'downvote-complete'; postId: string; ok: boolean }
  | { type: 'model-status-request' }
  | { type: 'model-status'; status: ModelStatus }
  | { type: 'model-retry' }
  | { type: 'downvote-post'; postId: string; text: string }
  | { type: 'wrong-call'; postId: string; firedLayerIds: readonly string[] }
  | {
      type: 'record-stats-batch';
      entries: readonly { hidden: boolean; reasons: readonly string[] }[];
    }
  | { type: 'record-wrong-call'; reasonIds: readonly string[] };

const messageTypes = [
  'selftest-result',
  'offscreen-ready',
  'get-selftest-state',
  'score-batch-request',
  'score-batch-response',
  'embed-request',
  'embed-response',
  'downvote-complete',
  'model-status-request',
  'model-status',
  'model-retry',
  'downvote-post',
  'wrong-call',
  'record-stats-batch',
  'record-wrong-call',
] as const;

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const type = value.type;
  return typeof type === 'string' && messageTypes.includes(type as (typeof messageTypes)[number]);
}
