import { describe, expect, test } from 'vitest';
import type { Post } from '@/core/post';
import { scorePost } from '@/core/scoring/pipeline';
import { DEFAULT_SCORING_CONFIG } from '@/core/scoring/weights';
import type { RepetitionCorpusEntry, RepetitionTarget } from '@/core/signals/repetition';
import { hammingDistance, scoreRepetition, simhash64 } from '@/core/signals/repetition';
import {
  REPETITION_CALIBRATION_CONFIG,
  REPETITION_ROWS,
  UNRELATED_TEXT,
} from '../../../fixtures/posts/repetition';

const post: Post = {
  id: 'post-1',
  permalink: null,
  text: 'post',
  postedAt: null,
  author: { handle: '@account01', displayName: 'Account 01', profileUrl: null },
  engagement: { replies: 0, reposts: 0, likes: 0, views: 1 },
  imageUrls: [],
  hasVideo: false,
};

describe('simhash64 and hammingDistance', () => {
  test('identical text hashes to an identical hash', () => {
    const text = 'post';
    expect(simhash64(text)).toBe(simhash64(text));
  });

  test('near-identical templates sit inside the gate while unrelated text sits far away', () => {
    const alpha =
      'Our brand new platform just shipped the long awaited dashboard update and our whole team worked late shifts to polish the migration for every beta member who requested it';
    const beta =
      'Our brand new platform just released the long awaited dashboard update and our whole team worked late shifts to polish the migration for every beta member who requested it';
    const unrelated =
      'Weather for the capital today is clear and sunny with a light breeze in the afternoon and no chance of rain until late evening.';

    expect(hammingDistance(simhash64(alpha), simhash64(beta))).toBeLessThanOrEqual(
      REPETITION_CALIBRATION_CONFIG.simhashHammingGate,
    );
    expect(UNRELATED_TEXT).toBe(unrelated);
    expect(hammingDistance(simhash64(alpha), simhash64(UNRELATED_TEXT))).toBeGreaterThan(
      REPETITION_CALIBRATION_CONFIG.simhashHammingGate,
    );
  });
});

describe('scoreRepetition calibration', () => {
  test.each(REPETITION_ROWS)('$id reaches its documented outcome', (row) => {
    const result = scoreRepetition(row.target, row.corpus, REPETITION_CALIBRATION_CONFIG);

    if (row.outcome === 'no-data' || row.outcome === 'no-fire') {
      expect(result.score).toBe(0);
      expect(result.reason).toBeNull();
    } else if (row.outcome === 'strong') {
      expect(result.score).toBeGreaterThanOrEqual(0.6);
    } else {
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(0.6);
    }
    if (row.expectedReason) expect(result.reason).toBe(row.expectedReason);
    expect(result.detail).toBeDefined();
  });

  test('the cross-account sub-signal records its raw inputs in the detail', () => {
    const strong = REPETITION_ROWS[0];
    if (!strong) throw new Error('missing calibration row');
    const result = scoreRepetition(strong.target, strong.corpus, REPETITION_CALIBRATION_CONFIG);
    expect(result.detail?.values?.clusterSize).toBe(6);
    expect(result.detail?.values?.distinctHandles).toBe(5);
    expect(result.detail?.values?.similarity).toBe(1);
    expect(result.detail?.values?.subSignal).toBe('cross-account-repetition');
  });

  test('a maximal repetition fire alone does not cross the hide threshold', () => {
    const strong = REPETITION_ROWS[0];
    if (!strong) throw new Error('missing calibration row');
    const signal = scoreRepetition(strong.target, strong.corpus, REPETITION_CALIBRATION_CONFIG);
    const breakdown = scorePost(post, [signal], DEFAULT_SCORING_CONFIG);

    expect(signal.score).toBeGreaterThanOrEqual(0.6);
    expect(breakdown.compositeScore).toBeLessThan(DEFAULT_SCORING_CONFIG.hideThreshold);
    expect(breakdown.hidden).toBe(false);
  });

  test('the simhash gate rejects a candidate before any cosine comparison', () => {
    const target: RepetitionTarget = {
      handle: '@news-a',
      embedding: new Float32Array([1, 1, 1, 1]),
      simhash: simhash64(
        'Breaking: the city council voted to close the central market for repairs starting next Monday at nine in the morning.',
      ),
      textLength: 117,
    };
    const corpusEntry: RepetitionCorpusEntry = {
      postId: 'corpus-news',
      handle: '@news-b',
      embedding: new Float32Array([1, 1, 1, 1]),
      simhash: simhash64(
        'Officials have decided the downtown market will shut down for maintenance beginning Monday morning at nine.',
      ),
      observedAt: 1,
    };

    const result = scoreRepetition(target, [corpusEntry], REPETITION_CALIBRATION_CONFIG);

    expect(result.score).toBe(0);
    expect(result.detail?.status).toBe('below-cutoff');
    expect(result.detail?.values?.hammingCandidates).toBe(0);
    expect(result.detail?.values?.matchedCount).toBe(0);
  });
});
