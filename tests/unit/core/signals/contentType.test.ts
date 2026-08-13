import { describe, expect, test } from 'vitest';
import { scorePost } from '@/core/scoring/pipeline';
import type { SignalResult } from '@/core/scoring/types';
import { CONTENT_FORMAT_DEFAULTS, DEFAULT_SCORING_CONFIG } from '@/core/scoring/weights';
import {
  CENTROID_SIMILARITY_THRESHOLD,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_PROTOTYPES,
  combineContentType,
  scoreContentCentroid,
  scoreContentFormat,
} from '@/core/signals/contentType';
import {
  CONTENT_CENTROID_CONFIG,
  CONTENT_CENTROID_ROWS,
  CONTENT_CENTROID_VECTORS,
} from '../../../fixtures/posts/contentCentroid';
import { CONTENT_FORMAT_ROWS } from '../../../fixtures/posts/contentFormat';

const post = {
  id: 'post-1',
  permalink: null,
  text: 'post',
  postedAt: '2026-08-05T10:00:00.000Z',
  author: { handle: '@account01', displayName: 'Account 01', profileUrl: null },
  engagement: { replies: 0, reposts: 0, likes: 0, views: 1 },
  imageUrls: [],
  hasVideo: false,
};

describe('scoreContentFormat calibration', () => {
  test.each(CONTENT_FORMAT_ROWS)('$id reaches its documented outcome', (row) => {
    const result = scoreContentFormat(row.text, CONTENT_FORMAT_DEFAULTS);

    if (row.outcome === 'no-data') {
      expect(result.score).toBe(0);
      expect(result.reason).toBeNull();
      expect(result.detail?.status).toBe('no-data');
      return;
    }
    if (row.outcome === 'no-fire') {
      expect(result.score).toBe(0);
      expect(result.reason).toBeNull();
      return;
    }
    const fired = row.firedFeatures;
    const firedIds = Object.entries(result.detail?.values ?? {}).filter(
      ([key, value]) => value !== 0 && key !== 'firedFeatureCount',
    );
    expect(firedIds.map(([id]) => id).sort(), row.id).toEqual([...fired].sort());
    if (row.outcome === 'strong') {
      expect(result.score).toBeGreaterThanOrEqual(0.6);
    } else {
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(0.6);
    }
    expect(result.reason).not.toBeNull();
  });

  test('records the raw count of each fired feature in the detail', () => {
    const giveaway = CONTENT_FORMAT_ROWS[0];
    if (!giveaway) throw new Error('missing calibration row');
    const result = scoreContentFormat(giveaway.text, CONTENT_FORMAT_DEFAULTS);
    expect(result.detail?.values?.hashtagStuffing).toBe(8);
    expect(result.detail?.values?.callToAction).toBe(4);
    expect(result.detail?.values?.listRun).toBe(3);
  });

  test('a single maximal feature fire never crosses the hide threshold', () => {
    const result = scoreContentFormat(
      'Here is the full lineup for tonight: #draft #nba #highlights #news #scores #updates #recap #more',
      CONTENT_FORMAT_DEFAULTS,
    );
    const composite = result.score * DEFAULT_SCORING_CONFIG.weights['content-type'];

    expect(result.score).toBe(CONTENT_FORMAT_DEFAULTS.featureWeights.hashtagStuffing);
    expect(composite).toBeLessThan(DEFAULT_SCORING_CONFIG.hideThreshold);
  });

  test('the score is capped at the documented format cap', () => {
    const result = scoreContentFormat(CONTENT_FORMAT_ROWS[0]?.text ?? '', CONTENT_FORMAT_DEFAULTS);
    expect(result.score).toBe(CONTENT_FORMAT_DEFAULTS.scoreCap);
  });
});

describe('scoreContentCentroid calibration', () => {
  test('keeps the prototype table auditable and broad enough', () => {
    expect(CONTENT_TYPE_PROTOTYPES.map(({ label }) => label)).toEqual([...CONTENT_TYPE_LABELS]);
    for (const prototype of CONTENT_TYPE_PROTOTYPES) {
      expect(prototype.examples.length).toBeGreaterThanOrEqual(12);
      expect(prototype.note).not.toBe('');
      for (const example of prototype.examples) {
        expect(example.text).not.toBe('');
        expect(example.note).not.toBe('');
      }
    }
  });

  test.each(CONTENT_CENTROID_ROWS)('$id reaches its documented outcome', (row) => {
    const result = scoreContentCentroid(
      row.embedding,
      CONTENT_CENTROID_VECTORS,
      CONTENT_CENTROID_CONFIG,
    );
    if (row.outcome === 'no-data') {
      expect(result.detail?.status).toBe('no-data');
      expect(result.score).toBe(0);
      expect(result.reason).toBeNull();
      return;
    }
    if (row.outcome === 'below-cutoff') {
      expect(result.detail?.status).toBe('below-cutoff');
      expect(result.score).toBe(0);
      expect(result.reason).toBeNull();
      return;
    }
    expect(result.detail?.status).toBe('scored');
    expect(result.detail?.values?.winningLabel).toBe(row.outcome);
    expect(result.score).toBeGreaterThanOrEqual(CENTROID_SIMILARITY_THRESHOLD);
    expect(result.reason).not.toBeNull();
  });

  test('records every label cosine and fails open without an embedding', () => {
    const scored = scoreContentCentroid([1, 0, 0], CONTENT_CENTROID_VECTORS);
    expect(scored.detail?.values?.['engagement bait']).toBe(1);
    expect(scored.detail?.values?.['generic motivational content']).toBe(0);
    expect(scored.detail?.values?.['giveaway or crypto spam']).toBe(0);
    expect(scoreContentCentroid(null, CONTENT_CENTROID_VECTORS).detail?.status).toBe('no-data');
  });
});

describe('combineContentType', () => {
  const structural = (score: number, reason: string | null): SignalResult => ({
    layerId: 'content-type',
    ok: true,
    score,
    reason,
    detail: { status: 'scored', values: { structural: true } },
  });
  const model = (score: number, reason: string | null): SignalResult => ({
    layerId: 'content-type',
    ok: true,
    score,
    reason,
    detail: { status: 'scored', values: { winningLabel: 'engagement bait' } },
  });

  test('takes the model result when it is strictly stronger', () => {
    const combined = combineContentType(
      structural(0.3, '2 hashtags'),
      model(0.9, 'engagement bait content'),
    );
    expect(combined.reason).toBe('engagement bait content');
    expect(combined.detail?.values?.winningLabel).toBe('engagement bait');
  });

  test('keeps a confident structural fire over a weaker model result', () => {
    const combined = combineContentType(structural(0.85, '9 hashtags'), model(0.4, null));
    expect(combined.reason).toBe('9 hashtags');
    expect(combined.detail?.values?.structural).toBe(true);
  });

  test('a loaded model never lowers a confident structural score', () => {
    const structuralResult = structural(0.85, '9 hashtags');
    const combined = combineContentType(structuralResult, model(0.8, 'engagement bait content'));
    expect(combined.score).toBe(structuralResult.score);
  });

  test('an unavailable or gated model leaves the structural score untouched', () => {
    const unavailable: SignalResult = {
      layerId: 'content-type',
      ok: false,
      score: 0,
      reason: null,
      detail: { status: 'unavailable' },
    };
    const combined = combineContentType(structural(0.45, 'numbered list'), unavailable);
    expect(combined.reason).toBe('numbered list');
    expect(combined.score).toBe(0.45);
  });

  test('keeps scorePost to a single content-type contribution so the layer weight is not doubled', () => {
    const combined = combineContentType(
      structural(0.45, 'numbered list'),
      model(0.9, 'engagement bait content'),
    );
    const result = scorePost(post, [combined], DEFAULT_SCORING_CONFIG);
    expect(result.contributions).toHaveLength(1);
    expect(result.compositeScore).toBeCloseTo(0.9 * 0.5, 10);
  });
});
