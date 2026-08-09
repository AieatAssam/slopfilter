import { describe, expect, test } from 'vitest';
import type { Post } from '@/core/post';
import {
  type AuthorActivity,
  deriveAuthorActivityFromCache,
  MIN_OBSERVATION_SPAN_HOURS,
  scoreBehavioural,
} from '@/core/signals/behavioural';

const thresholds = {
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

const NO_MATCH_ENGAGEMENT_POST = post({
  engagement: { replies: 0, reposts: 0, likes: 0, views: 0 },
});

const activity = (overrides: Partial<AuthorActivity> = {}): AuthorActivity => ({
  postsPerDay: null,
  observedPostCount: 0,
  observationWindowHours: 0,
  observedSpanHours: null,
  distinctPostCount: 0,
  lifetimePostsPerDay: null,
  accountAgeDays: null,
  ...overrides,
});

const HOUR = 3_600_000;

describe('deriveAuthorActivityFromCache', () => {
  const cache = (
    timestamps: number[],
    profile: { joinDate: number | null; postCount: number | null } = {
      joinDate: null,
      postCount: null,
    },
  ) => {
    const posts: Record<string, number> = {};
    timestamps.forEach((timestamp, index) => {
      posts[`post-${index}`] = timestamp;
    });
    return {
      firstSeen: timestamps[0] ?? 0,
      lastSeen: timestamps.at(-1) ?? 0,
      posts,
      profileJoinDate: profile.joinDate,
      profilePostCount: profile.postCount,
    };
  };

  test('returns null for an empty cache', () => {
    expect(deriveAuthorActivityFromCache(cache([]), Date.now())).toBeNull();
  });

  test('yields no-data rather than an extrapolated rate below the documented minimum span', () => {
    const now = Date.parse('2026-08-05T10:00:00.000Z');
    const minutesAgo = now - 4 * 60_000;
    const result = deriveAuthorActivityFromCache(
      cache([minutesAgo, minutesAgo - 2 * 60_000, minutesAgo - 4 * 60_000]),
      now,
    );

    expect(result?.postsPerDay).toBeNull();
    expect(result?.distinctPostCount).toBe(3);
    expect(result?.observedSpanHours).toBeLessThan(MIN_OBSERVATION_SPAN_HOURS);
  });

  test('derives the recent rate from distinct post ids over the observed span', () => {
    const now = Date.parse('2026-08-05T10:00:00.000Z');
    const result = deriveAuthorActivityFromCache(
      cache([now - 2 * HOUR, now - 1.5 * HOUR, now - 1 * HOUR, now - 0.5 * HOUR, now]),
      now,
    );

    expect(result?.distinctPostCount).toBe(5);
    expect(result?.postsPerDay).toBeCloseTo(48, 1);
  });

  test('derives the lifetime rate from profile post count over account age', () => {
    const now = Date.parse('2026-08-05T10:00:00.000Z');
    const joinDate = now - 5 * 86_400_000;
    const result = deriveAuthorActivityFromCache(
      cache([now - HOUR, now], { joinDate, postCount: 250 }),
      now,
    );

    expect(result?.accountAgeDays).toBeCloseTo(5, 1);
    expect(result?.lifetimePostsPerDay).toBeCloseTo(50, 1);
  });

  test('keeps the lifetime rate null when profile stats are absent', () => {
    const now = Date.parse('2026-08-05T10:00:00.000Z');
    const result = deriveAuthorActivityFromCache(cache([now - HOUR, now]), now);

    expect(result?.lifetimePostsPerDay).toBeNull();
    expect(result?.accountAgeDays).toBeNull();
  });
});

describe('scoreBehavioural sub-signals', () => {
  test('emits the recent rate as its own contribution with its own reason', () => {
    const result = scoreBehavioural(
      NO_MATCH_ENGAGEMENT_POST,
      activity({
        postsPerDay: 80,
        distinctPostCount: 4,
        observedSpanHours: 1,
        observedPostCount: 4,
        observationWindowHours: 1,
      }),
      thresholds,
    );

    expect(result.score).toBe(1);
    expect(result.reason).toContain('posts 80+ times per day');
    expect(result.reason).not.toContain('old account');
  });

  test('emits the lifetime rate as its own contribution with its own reason', () => {
    const result = scoreBehavioural(
      NO_MATCH_ENGAGEMENT_POST,
      activity({
        postsPerDay: null,
        lifetimePostsPerDay: 80,
        accountAgeDays: 3,
        distinctPostCount: 2,
      }),
      thresholds,
    );

    expect(result.score).toBe(1);
    expect(result.reason).toContain('80/day across a 3-day-old account');
    expect(result.reason).not.toContain('times per day');
  });

  test('never lets one sub-signal stand in for the other', () => {
    const result = scoreBehavioural(
      NO_MATCH_ENGAGEMENT_POST,
      activity({ postsPerDay: 80, lifetimePostsPerDay: 60, accountAgeDays: 2 }),
      thresholds,
    );

    expect(result.reason).toContain('posts 80+ times per day');
    expect(result.reason).toContain('/day across a 2-day-old account');
  });

  test('reports no-data values when the cache is empty', () => {
    const result = scoreBehavioural(NO_MATCH_ENGAGEMENT_POST, null, thresholds);

    expect(result).toMatchObject({
      score: 0,
      reason: null,
      detail: { status: 'no-data' },
    });
  });

  test('clamps agreement across both sub-signals into the inclusive range', () => {
    const result = scoreBehavioural(
      NO_MATCH_ENGAGEMENT_POST,
      activity({ postsPerDay: 1_000_000, lifetimePostsPerDay: 1_000_000, accountAgeDays: 1 }),
      thresholds,
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
