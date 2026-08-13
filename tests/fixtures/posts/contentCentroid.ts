import type { ContentCentroidConfig } from '@/core/signals/contentType';

export interface ContentCentroidRow {
  id: string;
  embedding: readonly number[] | null;
  outcome:
    | 'engagement bait'
    | 'generic motivational content'
    | 'giveaway or crypto spam'
    | 'below-cutoff'
    | 'no-data';
  derivation: string;
}

export const CONTENT_CENTROID_CONFIG: ContentCentroidConfig = { similarityThreshold: 0.62 };

// Synthetic orthogonal vectors keep this unit calibration deterministic without downloading the
// embedder. They exercise the same cosine threshold and label ordering used by the worker.
export const CONTENT_CENTROID_ROWS: readonly ContentCentroidRow[] = [
  {
    id: 'giveaway-post',
    embedding: [0, 0, 1],
    outcome: 'giveaway or crypto spam',
    derivation: 'The giveaway axis has cosine 1.0, above the 0.62 centroid threshold.',
  },
  {
    id: 'motivational-post',
    embedding: [0, 1, 0],
    outcome: 'generic motivational content',
    derivation: 'The motivational axis has cosine 1.0, above the 0.62 centroid threshold.',
  },
  {
    id: 'technical-crypto-infrastructure',
    embedding: [0.1, 0.1, 0.1],
    outcome: 'below-cutoff',
    derivation: 'All three equal axes have cosine 0.577, below the 0.62 threshold.',
  },
  {
    id: 'terse-post',
    embedding: [],
    outcome: 'no-data',
    derivation: 'An empty embedding has no measurable content-type evidence.',
  },
  {
    id: 'missing-embedding',
    embedding: null,
    outcome: 'no-data',
    derivation: 'No embedding means the model contribution fails open.',
  },
];

export const CONTENT_CENTROID_VECTORS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
] as const;
