import { describe, expect, test } from 'vitest';
import type { Post } from '@/core/post';
import {
  type AuthorActivity,
  type BehaviouralThresholds,
  deriveAuthorActivity,
  scoreBehavioural,
} from '@/core/signals/behavioural';

const thresholds: BehaviouralThresholds = {
  postsPerDayThreshold: 40,
  engagementRatioThreshold: 0.01,
  meaningfulEngagementFloor: 50,
};

const post = (overrides: Partial<Post> = {}): Post => ({
  id: 'post-1',
  permalink: null,
  text: 'post',
  postedAt: '2026-08-05T10:00:00.000Z',
  author: { handle: '@account01', displayName: 'Account 01', profileUrl: null },
  engagement: { replies: 0, reposts: 0, likes: 0, views: 1000 },
  imageUrls: [],
  hasVideo: false,
  ...overrides,
});

const activity = (overrides: Partial<AuthorActivity> = {}): AuthorActivity => ({
  postsPerDay: null,
  observedPostCount: 1,
  observationWindowHours: 0,
  ...overrides,
});

describe('deriveAuthorActivity', () => {
  test('estimates a rate from consecutive timestamps for one author', () => {
    const posts = [
      post({ id: 'a', postedAt: '2026-08-05T08:00:00.000Z' }),
      post({ id: 'b', postedAt: '2026-08-05T09:00:00.000Z' }),
      post({ id: 'c', postedAt: '2026-08-05T10:00:00.000Z' }),
      post({ id: 'other', author: { handle: '@other', displayName: 'Other', profileUrl: null } }),
    ];

    expect(deriveAuthorActivity(posts, '@account01')).toEqual({
      postsPerDay: 24,
      observedPostCount: 3,
      observationWindowHours: 2,
    });
  });

  test('returns null when no usable timestamp is available', () => {
    expect(deriveAuthorActivity([post({ postedAt: null })], '@account01')).toBeNull();
  });
});

describe('scoreBehavioural', () => {
  test('returns score 0 and reason null when activity is null', () => {
    expect(scoreBehavioural(post(), null, thresholds)).toEqual({
      layerId: 'behavioural',
      ok: true,
      score: 0,
      reason: null,
    });
  });

  test('returns a frequency reason when posts per day exceeds the threshold', () => {
    const result = scoreBehavioural(post(), activity({ postsPerDay: 80 }), thresholds);

    expect(result.score).toBe(1);
    expect(result.reason).toContain('posts 80+ times per day');
  });

  test('returns an engagement reason when engagement ratio is below the threshold', () => {
    const result = scoreBehavioural(post(), activity(), thresholds);

    expect(result.score).toBe(1);
    expect(result.reason).toContain('high views with weak absolute engagement');
  });

  test('does not treat meaningful likes as weak engagement', () => {
    const result = scoreBehavioural(
      post({ engagement: { replies: 0, reposts: 0, likes: 51, views: 1_000_000 } }),
      activity(),
      thresholds,
    );

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('gives reposts more weight than likes when checking social proof', () => {
    const result = scoreBehavioural(
      post({ engagement: { replies: 0, reposts: 10, likes: 0, views: 1_000_000 } }),
      activity(),
      thresholds,
    );

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('clamps the returned score to the inclusive range 0 to 1', () => {
    const result = scoreBehavioural(
      post({ engagement: { replies: 0, reposts: 0, likes: 0, views: 1_000_000 } }),
      activity({ postsPerDay: 1_000_000 }),
      thresholds,
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  test('never returns an authorship claim', () => {
    const result = scoreBehavioural(post(), activity({ postsPerDay: 80 }), thresholds);

    expect(result.reason).not.toMatch(/\b(ai|generated|synthetic|authored)\b/i);
  });
});
