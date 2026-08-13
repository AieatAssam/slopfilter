import { describe, expect, test } from 'vitest';
import { scorePost } from '@/core/scoring/pipeline';
import { DEFAULT_SCORING_CONFIG, TEXT_PATTERN_DEFAULTS } from '@/core/scoring/weights';
import { scoreTextPattern } from '@/core/signals/textPattern';

const longText = 'A'.repeat(400);

describe('scoreTextPattern', () => {
  test('returns the raw output with no reason on a long post', () => {
    const result = scoreTextPattern({ human: 0.1, llm: 0.9 }, longText, TEXT_PATTERN_DEFAULTS);
    expect(result.score).toBe(0.9);
    expect(result.reason).toBeNull();
    expect(result.detail?.values).toMatchObject({ human: 0.1, llm: 0.9, characterCount: 400 });
  });

  test('skips short or missing input', () => {
    expect(
      scoreTextPattern({ human: 0, llm: 1 }, 'short', TEXT_PATTERN_DEFAULTS).detail?.status,
    ).toBe('no-data');
    expect(scoreTextPattern(null, longText, TEXT_PATTERN_DEFAULTS).detail?.status).toBe('no-data');
  });

  test('a maximal output stays below the hide threshold alone', () => {
    const signal = scoreTextPattern({ human: 0, llm: 1 }, longText, TEXT_PATTERN_DEFAULTS);
    const result = scorePost(
      {
        id: 'text-pattern-post',
        permalink: null,
        text: longText,
        postedAt: null,
        author: { handle: '@account01', displayName: 'Account 01', profileUrl: null },
        engagement: { replies: 0, reposts: 0, likes: 0, views: 0 },
        imageUrls: [],
        hasVideo: false,
      },
      [signal],
      DEFAULT_SCORING_CONFIG,
    );
    expect(result.hidden).toBe(false);
    expect(result.compositeScore).toBeLessThan(DEFAULT_SCORING_CONFIG.hideThreshold);
    expect(signal.reason).toBeNull();
  });
});
