import { REPETITION_DEFAULTS } from '@/core/scoring/weights';
import type { RepetitionCorpusEntry, RepetitionTarget } from '@/core/signals/repetition';
import { simhash64 } from '@/core/signals/repetition';

// SF-219 calibration rows for scoreRepetition. Each row names the outcome it must reach: a template
// repeated across six handles fires strongly, same-author three-times repetition fires weakly, a
// same-author pair stays below the floor, two differently-worded posts about the same event do not
// fire (the simhash gate rejects them before any cosine pass), a 40-character post is skipped on the
// length gate, and an empty corpus returns no data.
export type RepetitionOutcome = 'strong' | 'weak' | 'no-fire' | 'no-data';

export interface RepetitionRow {
  id: string;
  outcome: RepetitionOutcome;
  derivation: string;
  target: RepetitionTarget;
  corpus: readonly RepetitionCorpusEntry[];
  expectedReason?: string;
}

let sequence = 0;

const entry = (
  handle: string,
  text: string,
  vector: Float32Array,
  postId = `corpus-${++sequence}`,
): RepetitionCorpusEntry => ({
  postId,
  handle,
  embedding: vector,
  simhash: simhash64(text),
  observedAt: sequence,
});

const target = (
  handle: string,
  text: string,
  vector: Float32Array,
  embedding: Float32Array | null = vector,
): RepetitionTarget => ({
  handle,
  embedding,
  simhash: simhash64(text),
  textLength: text.length,
});

const vector = (unit: number): Float32Array => Float32Array.from([unit, unit, unit, unit]);

// One product-launch template with minimal noun swaps (verified pairwise simhash Hamming <= 12), so
// the whole cluster passes the cheap gate and only the cosine threshold decides the grade.
const TEMPLATE_ALPHA =
  'Our brand new platform just shipped the long awaited dashboard update and our whole team worked late shifts to polish the migration for every beta member who requested it';
const TEMPLATE_BETA =
  'Our brand new platform just shipped the long awaited dashboard update and our whole team worked late shifts to polish the migration for every beta member who requested it';

// Differently-worded posts about the same event: semantically related, but the character 5-gram
// simhashes are far apart (verified Hamming 27 > gate 12), so the cheap gate rejects the pair
// before any embedding work.
const NEWS_ALPHA =
  'Breaking: the city council voted to close the central market for repairs starting next Monday at nine in the morning.';
const NEWS_BETA =
  'Officials have decided the downtown market will shut down for maintenance beginning Monday morning at nine.';

const UNRELATED =
  'Weather for the capital today is clear and sunny with a light breeze in the afternoon and no chance of rain until late evening.';

const SHORT_TEXT = 'Short status update, nothing templated here.';

export const TEMPLATE_VECTOR = vector(1);
export const NEWS_VECTOR = vector(1);

// An unrelated post: far enough from the template that the simhash gate alone removes it.
export const UNRELATED_TEXT = UNRELATED;

export const REPETITION_ROWS: readonly RepetitionRow[] = [
  {
    id: 'six-handle-template-fires-strongly',
    outcome: 'strong',
    derivation:
      'five corpus entries carry the same template under five distinct handles; the target adds a sixth. clusterSize 6, distinctHandles 5, similarity 1.0. score = 1.0 * (0.4 + 0.6 * 0.667) * (0.5 + 0.5) = 0.8, a strong fire that still cannot hide alone at weight 0.3.',
    target: target('@target', TEMPLATE_ALPHA, TEMPLATE_VECTOR),
    corpus: ['@handle-a', '@handle-b', '@handle-c', '@handle-d', '@handle-e'].map((handle) =>
      entry(handle, TEMPLATE_ALPHA, TEMPLATE_VECTOR),
    ),
    expectedReason: 'near-identical to 5 other posts in this feed',
  },
  {
    id: 'one-author-repeat-fires-weakly',
    outcome: 'weak',
    derivation:
      'three posts of the same text from the same handle reach clusterFloor; distinctHandles 1 so the author-self sub-signal caps the score at similarity * 0.25 = 0.25. A person repeating themselves is a weak, not strong, indicator.',
    target: target('@repeat', TEMPLATE_ALPHA, TEMPLATE_VECTOR),
    corpus: [
      entry('@repeat', TEMPLATE_ALPHA, TEMPLATE_VECTOR),
      entry('@repeat', TEMPLATE_BETA, TEMPLATE_VECTOR),
    ],
    expectedReason: 'near-identical to 2 earlier posts by the same author',
  },
  {
    id: 'same-author-pair-below-floor',
    outcome: 'no-fire',
    derivation:
      'one matching corpus entry makes clusterSize 2, below clusterFloor 3. Quoting yourself once is not yet a pattern.',
    target: target('@repeat', TEMPLATE_ALPHA, TEMPLATE_VECTOR),
    corpus: [entry('@repeat', TEMPLATE_BETA, TEMPLATE_VECTOR)],
  },
  {
    id: 'news-posts-do-not-fire',
    outcome: 'no-fire',
    derivation:
      'two differently-worded posts about the same event have Hamming 27 > simhashHammingGate 12, so no embedding candidate survives and the signal reports below the cutoff even though the semantic vectors are close.',
    target: target('@news-a', NEWS_ALPHA, NEWS_VECTOR),
    corpus: [entry('@news-b', NEWS_BETA, NEWS_VECTOR)],
  },
  {
    id: 'short-post-skipped-on-length',
    outcome: 'no-data',
    derivation:
      'textLength 44 is below minTextLength 60, so the signal returns no data before any hash or vector work.',
    target: target('@short', SHORT_TEXT, TEMPLATE_VECTOR),
    corpus: [entry('@handle-a', TEMPLATE_ALPHA, TEMPLATE_VECTOR)],
  },
  {
    id: 'empty-corpus-no-data',
    outcome: 'no-data',
    derivation:
      'an empty corpus means there is nothing to compare against; the signal returns no data and never blocks scoring.',
    target: target('@first', TEMPLATE_ALPHA, TEMPLATE_VECTOR),
    corpus: [],
  },
  {
    id: 'missing-embedding-unavailable',
    outcome: 'no-data',
    derivation:
      'when the embedder never delivered a vector, the signal returns unavailable (no data) rather than guessing, and never blocks scoring.',
    target: target('@no-embed', TEMPLATE_ALPHA, TEMPLATE_VECTOR, null),
    corpus: [entry('@handle-a', TEMPLATE_ALPHA, TEMPLATE_VECTOR)],
  },
];

export const REPETITION_CALIBRATION_CONFIG = REPETITION_DEFAULTS;
