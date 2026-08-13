import type { Post } from '@/core/post';
import type { SignalResult } from '@/core/scoring/types';

export type WorkerRequest =
  | { type: 'load' }
  | {
      type: 'score-batch';
      requestId: string;
      posts: readonly Post[];
      textPatternEnabled?: boolean;
    }
  | { type: 'load-text-pattern'; requestId: string }
  | { type: 'embed'; requestId: string; text: string }
  | { type: 'downvote'; requestId: string; postId: string; text: string };

export type WorkerResponse =
  | { type: 'progress'; progress: number }
  | { type: 'ready' }
  | { type: 'failed'; error: string }
  | { type: 'text-pattern-ready'; requestId: string }
  | { type: 'text-pattern-failed'; requestId: string }
  | {
      type: 'score-batch-response';
      requestId: string;
      results: readonly {
        postId: string;
        signals: readonly SignalResult[];
        embedding: readonly number[];
      }[];
    }
  | { type: 'embed-response'; requestId: string; vector: readonly number[] }
  | { type: 'downvote-response'; requestId: string; postId: string; ok: boolean };
