import { describe, expect, test } from 'vitest';
import type { Post } from '@/core/post';
import { scorePost } from '@/core/scoring/pipeline';
import type { ScoringConfig, SignalResult } from '@/core/scoring/types';
import { DEFAULT_SCORING_CONFIG, DEFAULT_THRESHOLDS, VETO_RULES } from '@/core/scoring/weights';
import { scoreBehavioural } from '@/core/signals/behavioural';
import scoringFixtures from '../../../fixtures/posts/posts-scoring.json';

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

const config: ScoringConfig = {
  hideThreshold: 0.6,
  weights: {
    behavioural: 0.5,
    provenance: 0.2,
    'content-type': 0.1,
    'image-forensics': 0.1,
    taste: 0.1,
  },
};

const behavioural = (score: number, reason: string | null = null): SignalResult => ({
  layerId: 'behavioural',
  ok: true,
  score,
  reason,
});

describe('scorePost', () => {
  test('never hides a post with no signal results', () => {
    expect(scorePost(post, [], { ...config, hideThreshold: 0 })).toEqual({
      compositeScore: 0,
      threshold: 0,
      hidden: false,
      contributions: [],
      reasons: [],
    });
  });

  test('is deterministic for identical input', () => {
    const results = [behavioural(0.8, 'observable reason')];
    expect(scorePost(post, results, config)).toEqual(scorePost(post, results, config));
  });

  test('treats an errored signal as a zero contribution rather than a maximum', () => {
    const errored: SignalResult = {
      layerId: 'behavioural',
      ok: false,
      score: 1,
      reason: 'must not appear',
    };
    expect(scorePost(post, [errored], { ...config, hideThreshold: 0 })).toEqual({
      compositeScore: 0,
      threshold: 0,
      hidden: false,
      contributions: [],
      reasons: [],
    });
  });

  test('normalizes over the weights of available signals and preserves reason order', () => {
    const results: SignalResult[] = [
      { layerId: 'behavioural', ok: true, score: 0.8, reason: 'frequency evidence' },
      { layerId: 'provenance', ok: true, score: 0.2, reason: 'provenance evidence' },
    ];
    const result = scorePost(post, results, config);

    expect(result.compositeScore).toBeCloseTo(0.6286, 4);
    expect(result.hidden).toBe(true);
    expect(result.reasons).toEqual(['frequency evidence', 'provenance evidence']);
  });

  test('keeps the composite within the inclusive range for maximum inputs', () => {
    const results = (
      ['behavioural', 'provenance', 'content-type', 'image-forensics', 'taste'] as const
    ).map((layerId) => ({ layerId, ok: true, score: 1, reason: `${layerId} evidence` }));
    const result = scorePost(post, results, config);

    expect(result.compositeScore).toBe(1);
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore).toBeLessThanOrEqual(1);
  });

  test('clamps an out-of-range signal before combining it', () => {
    const result = scorePost(
      post,
      [{ layerId: 'behavioural', ok: true, score: 2, reason: 'evidence' }],
      { ...config, hideThreshold: 1 },
    );

    expect(result.compositeScore).toBe(1);
    expect(result.contributions[0]?.score).toBe(1);
  });

  test('uses an injected threshold without changing the composite score', () => {
    const results = [behavioural(0.7)];
    const hidden = scorePost(post, results, { ...config, hideThreshold: 0.6 });
    const visible = scorePost(post, results, { ...config, hideThreshold: 0.8 });

    expect(hidden.compositeScore).toBe(visible.compositeScore);
    expect(hidden.hidden).toBe(true);
    expect(visible.hidden).toBe(false);
  });

  test('ships no inferred veto rules until they are explicitly approved', () => {
    expect(VETO_RULES).toHaveLength(0);
  });

  test.each(scoringFixtures)('scores fixture $id to its recorded value', (fixture) => {
    const signal = scoreBehavioural(fixture.post, fixture.authorActivity, DEFAULT_THRESHOLDS);
    const result = scorePost(fixture.post, [signal], DEFAULT_SCORING_CONFIG);

    expect(result.compositeScore).toBeCloseTo(fixture.expectedScore, 4);
    expect(result.hidden).toBe(fixture.expectedHidden);
    for (const reasonId of fixture.expectedReasonIds) {
      expect(result.reasons.join(' ')).toContain(reasonId === 'frequency' ? 'posts' : 'engagement');
    }
    expect(fixture.derivation).toBeTruthy();
  });
});
