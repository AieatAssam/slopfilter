import type { SignalResult } from '@/core/scoring/types';

// Provisional HD-008 option: the three categories named by the PRD, equal weight, 0.8 confidence.
export const CONTENT_TYPE_LABELS = Object.freeze([
  'engagement bait',
  'generic motivational content',
  'giveaway or crypto spam',
] as const);
export const CONTENT_TYPE_CONFIDENCE_THRESHOLD = 0.8;
// ponytail: lexical gate keeps the slow zero-shot model under budget; broaden it if recall data warrants it.
export const CONTENT_TYPE_CANDIDATE_PATTERN =
  /\b(engagement|like|repost|retweet|follow|comment|share|giveaway|crypto|bitcoin|airdrop|winner|win|success|mindset|motivation|grind)\b/i;

export const shouldClassifyContent = (text: string): boolean =>
  CONTENT_TYPE_CANDIDATE_PATTERN.test(text);

export interface ClassifierOutput {
  labels: readonly string[];
  scores: readonly number[];
}

const reasonByLabel: Readonly<Record<string, string>> = Object.freeze({
  'engagement bait': 'engagement bait content',
  'generic motivational content': 'generic motivational content',
  'giveaway or crypto spam': 'giveaway or crypto-spam content',
});

export const scoreContentType = (output: ClassifierOutput): SignalResult => {
  const topIndex = output.scores.reduce(
    (best, score, index) =>
      score > (output.scores[best] ?? Number.NEGATIVE_INFINITY) ? index : best,
    0,
  );
  const label = output.labels[topIndex];
  const confidence = output.scores[topIndex] ?? 0;
  const reason = label ? reasonByLabel[label] : undefined;
  if (!reason || confidence < CONTENT_TYPE_CONFIDENCE_THRESHOLD) {
    return { layerId: 'content-type', ok: true, score: 0, reason: null };
  }
  return {
    layerId: 'content-type',
    ok: true,
    score: Math.max(0, Math.min(1, confidence)),
    reason,
  };
};
