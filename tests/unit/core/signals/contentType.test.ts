import { describe, expect, test } from 'vitest';
import {
  CONTENT_TYPE_CONFIDENCE_THRESHOLD,
  CONTENT_TYPE_LABELS,
  scoreContentType,
  shouldClassifyContent,
} from '@/core/signals/contentType';

describe('scoreContentType', () => {
  test('labels match the approved provisional set', () => {
    expect(CONTENT_TYPE_LABELS).toEqual([
      'engagement bait',
      'generic motivational content',
      'giveaway or crypto spam',
    ]);
  });

  test('only sends text with content-pattern hints to the slower classifier', () => {
    expect(shouldClassifyContent('A normal update from today.')).toBe(false);
    expect(shouldClassifyContent('Like and repost to win this giveaway.')).toBe(true);
  });

  test('returns score 0 and reason null below the confidence threshold', () => {
    const result = scoreContentType({
      labels: [CONTENT_TYPE_LABELS[0]],
      scores: [CONTENT_TYPE_CONFIDENCE_THRESHOLD - 0.01],
    });

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  test.each(CONTENT_TYPE_LABELS)('returns evidence for %s above the threshold', (label) => {
    const result = scoreContentType({ labels: [label], scores: [0.9] });

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.reason).toContain(label === 'giveaway or crypto spam' ? 'giveaway' : label);
  });

  test('clamps the score to the inclusive range', () => {
    const result = scoreContentType({ labels: [CONTENT_TYPE_LABELS[0]], scores: [2] });

    expect(result.score).toBe(1);
  });

  test('never returns an authorship claim', () => {
    const result = scoreContentType({ labels: [CONTENT_TYPE_LABELS[0]], scores: [0.9] });

    expect(result.reason).not.toMatch(/\b(ai|generated|synthetic|authored)\b/i);
  });
});
