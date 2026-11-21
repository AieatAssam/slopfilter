import { describe, expect, test } from 'vitest';
import type { Post } from '@/core/post';
import { DEFAULT_SCORING_CONFIG, DEFAULT_THRESHOLDS } from '@/core/scoring/weights';
import {
  type AuthorActivity,
  deriveAuthorActivity,
  scoreBehavioural,
} from '@/core/signals/behavioural';

const thresholds = DEFAULT_THRESHOLDS;

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
  observedSpanHours: null,
  distinctPostCount: 1,
  lifetimePostsPerDay: null,
  accountAgeDays: null,
  accountCreatedAt: null,
  profilePostCount: null,
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
      observedSpanHours: 2,
      distinctPostCount: 3,
      lifetimePostsPerDay: null,
      accountAgeDays: null,
      accountCreatedAt: null,
      profilePostCount: null,
      followers: null,
      following: null,
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
      detail: {
        status: 'no-data',
        values: {
          postsPerDay: null,
          observedPostCount: 0,
          observationWindowHours: null,
        },
      },
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

describe('scoreBehavioural replyHeavy', () => {
  const replyPost = (replies: number | null, likes: number | null): Post =>
    post({ engagement: { replies, reposts: 0, likes, views: 100_000 } });

  test('fires on a post with many replies and few likes, with the raw counts in the reason', () => {
    const result = scoreBehavioural(replyPost(300, 10), null, thresholds);

    expect(result.score).toBeCloseTo(0.45, 10);
    expect(result.reason).toBe('300 replies against 10 likes');
    expect(result.detail?.status).toBe('scored');
    expect(result.detail?.values?.replyToLikeRatio).toBe(30);
  });

  test('ramps toward the 0.45 cap as the reply-to-like ratio grows', () => {
    const modest = scoreBehavioural(replyPost(40, 30), null, thresholds);
    const strong = scoreBehavioural(replyPost(40, 1), null, thresholds);

    expect(modest.score).toBeGreaterThan(0);
    expect(modest.score).toBeLessThan(strong.score);
    expect(strong.score).toBeCloseTo(0.45 * Math.min(1, (40 - 1) / 1.5), 10);
  });

  test('a null like count leaves the sub-signal off', () => {
    const result = scoreBehavioural(replyPost(300, null), null, thresholds);

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('stays off below 30 replies', () => {
    const result = scoreBehavioural(replyPost(29, 0), null, thresholds);

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('stays off when replies are proportionate to likes', () => {
    const result = scoreBehavioural(replyPost(120, 120), null, thresholds);

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('a maximal replyHeavy fire alone stays under the 0.6 hide threshold', () => {
    const result = scoreBehavioural(replyPost(500, 0), null, thresholds);

    expect(result.score * DEFAULT_SCORING_CONFIG.weights.behavioural).toBeLessThan(
      DEFAULT_SCORING_CONFIG.hideThreshold,
    );
  });
});

describe('scoreBehavioural followChurn', () => {
  // No view count, so the low-engagement sub-signal cannot fire and muddy the followChurn result.
  const quietPost = post({ engagement: { replies: 0, reposts: 0, likes: 0, views: null } });
  const follow = (followers: number | null, following: number | null): AuthorActivity =>
    activity({ followers, following });

  test('fires on an account following thousands while followed by far fewer', () => {
    const result = scoreBehavioural(quietPost, follow(40, 4_500), thresholds);

    expect(result.score).toBeGreaterThan(0);
    expect(result.reason).toContain('follows 4,500 accounts, followed by 40');
    expect(result.detail?.values?.followers).toBe(40);
    expect(result.detail?.values?.following).toBe(4_500);
  });

  test('a journalist following 6k while followed by 200k does not fire', () => {
    const result = scoreBehavioural(quietPost, follow(200_000, 6_000), thresholds);

    expect(result.reason ?? '').not.toContain('follows');
    expect(result.score).toBe(0);
  });

  test('an ordinary account following 500 with 50 followers does not fire', () => {
    const result = scoreBehavioural(quietPost, follow(50, 500), thresholds);

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('stays off just below the 2,000 following floor', () => {
    const result = scoreBehavioural(quietPost, follow(1, 1_999), thresholds);

    expect(result.score).toBe(0);
  });

  test('stays off when either count is unknown, failing open', () => {
    expect(scoreBehavioural(quietPost, follow(null, 9_000), thresholds).score).toBe(0);
    expect(scoreBehavioural(quietPost, follow(10, null), thresholds).score).toBe(0);
  });

  test('a maximal followChurn fire alone stays under the 0.6 hide threshold', () => {
    const result = scoreBehavioural(quietPost, follow(0, 100_000), thresholds);

    expect(result.score).toBeCloseTo(0.5, 10);
    expect(result.score * DEFAULT_SCORING_CONFIG.weights.behavioural).toBeLessThan(
      DEFAULT_SCORING_CONFIG.hideThreshold,
    );
  });
});
