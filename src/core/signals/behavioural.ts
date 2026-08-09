import type { Post } from '@/core/post';
import type { SignalResult } from '@/core/scoring/types';

// A rate extrapolated from a span shorter than this is no-data, never a hide. Extrapolating
// 3 posts in 4 minutes to 1080 per day is how false positives happen.
export const MIN_OBSERVATION_SPAN_HOURS = 1;

export interface AuthorActivity {
  postsPerDay: number | null;
  observedPostCount: number;
  observationWindowHours: number;
  // SF-215: cache-derived observations carried alongside the in-viewport estimate.
  observedSpanHours: number | null;
  distinctPostCount: number;
  lifetimePostsPerDay: number | null;
  accountAgeDays: number | null;
}

export interface BehaviouralThresholds {
  postsPerDayThreshold: number;
  engagementRatioThreshold: number;
  meaningfulEngagementFloor: number;
}

export interface AuthorActivityCacheInput {
  firstSeen: number;
  lastSeen: number;
  posts: Readonly<Record<string, number>>;
  profileJoinDate: number | null;
  profilePostCount: number | null;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const validTimestamp = (post: Post): number | null => {
  if (!post.postedAt) return null;
  const timestamp = Date.parse(post.postedAt);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const distinctTimestamps = (posts: readonly Post[], handle: string): number[] =>
  Array.from(
    new Map(
      posts
        .filter((post) => post.author.handle === handle)
        .map((post) => [post.id, validTimestamp(post)] as const),
    ).values(),
  )
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((left, right) => left - right);

const activityFromTimestamps = (
  timestamps: readonly number[],
  profile: { joinDate: number | null; postCount: number | null; now: number },
): AuthorActivity | null => {
  if (timestamps.length === 0) return null;
  const first = timestamps[0];
  const last = timestamps.at(-1);
  if (first === undefined || last === undefined) return null;
  const observedSpanHours = (last - first) / HOUR_MS;
  const postsPerDay =
    timestamps.length > 1 && observedSpanHours >= MIN_OBSERVATION_SPAN_HOURS
      ? ((timestamps.length - 1) / observedSpanHours) * 24
      : null;
  const accountAgeDays =
    profile.joinDate !== null && profile.now > profile.joinDate
      ? (profile.now - profile.joinDate) / DAY_MS
      : null;
  const lifetimePostsPerDay =
    accountAgeDays !== null &&
    accountAgeDays > 0 &&
    profile.postCount !== null &&
    Number.isFinite(profile.postCount)
      ? profile.postCount / accountAgeDays
      : null;

  return {
    postsPerDay,
    observedPostCount: timestamps.length,
    observationWindowHours: observedSpanHours,
    observedSpanHours,
    distinctPostCount: timestamps.length,
    lifetimePostsPerDay,
    accountAgeDays,
  };
};

export function deriveAuthorActivity(
  posts: readonly Post[],
  handle: string,
): AuthorActivity | null {
  return activityFromTimestamps(distinctTimestamps(posts, handle), {
    joinDate: null,
    postCount: null,
    now: Date.now(),
  });
}

export function deriveAuthorActivityFromCache(
  input: AuthorActivityCacheInput,
  now: number,
): AuthorActivity | null {
  const timestamps = Object.values(input.posts)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
    .sort((left, right) => left - right);
  const first = input.firstSeen > 0 ? input.firstSeen : timestamps[0];
  const last = input.lastSeen > 0 ? input.lastSeen : timestamps.at(-1);
  if (typeof first !== 'number' || typeof last !== 'number') return null;
  const spanTimestamps = [first, last, ...timestamps].filter((timestamp): timestamp is number =>
    Number.isFinite(timestamp),
  );
  const spanFirst = Math.min(...spanTimestamps);
  const spanLast = Math.max(...spanTimestamps);
  const observedSpanHours = (spanLast - spanFirst) / HOUR_MS;
  const postsPerDay =
    timestamps.length > 1 && observedSpanHours >= MIN_OBSERVATION_SPAN_HOURS
      ? ((timestamps.length - 1) / observedSpanHours) * 24
      : null;
  const accountAgeDays =
    input.profileJoinDate !== null && now > input.profileJoinDate
      ? (now - input.profileJoinDate) / DAY_MS
      : null;
  const lifetimePostsPerDay =
    accountAgeDays !== null &&
    accountAgeDays > 0 &&
    input.profilePostCount !== null &&
    Number.isFinite(input.profilePostCount)
      ? input.profilePostCount / accountAgeDays
      : null;

  return {
    postsPerDay,
    observedPostCount: timestamps.length,
    observationWindowHours: observedSpanHours,
    observedSpanHours,
    distinctPostCount: timestamps.length,
    lifetimePostsPerDay,
    accountAgeDays,
  };
}

const engagementRatio = (post: Post): number | null => {
  const views = post.engagement.views;
  if (views === null || views <= 0) return null;
  const interactions = [
    post.engagement.likes,
    post.engagement.reposts,
    post.engagement.replies,
  ].reduce<number>((total, value) => total + (value ?? 0), 0);
  return interactions / views;
};

const engagementStrength = (post: Post): number =>
  (post.engagement.likes ?? 0) +
  (post.engagement.reposts ?? 0) * 5 +
  (post.engagement.replies ?? 0) * 3;

const clamped = (value: number): number => Math.max(0, Math.min(1, value));

export function scoreBehavioural(
  post: Post,
  activity: AuthorActivity | null,
  thresholds: BehaviouralThresholds,
): SignalResult {
  if (!activity) {
    return {
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
    };
  }

  const scores: number[] = [];
  const reasons: string[] = [];
  const frequencyThreshold = Math.max(0, thresholds.postsPerDayThreshold);
  const recentRate = activity.postsPerDay ?? null;
  if (recentRate !== null && Number.isFinite(recentRate) && recentRate > frequencyThreshold) {
    const excess = (recentRate - frequencyThreshold) / Math.max(frequencyThreshold, 1);
    scores.push(clamped(0.6 + excess * 0.4));
    reasons.push(`posts ${Math.round(recentRate)}+ times per day`);
  }

  const lifetimeRate = activity.lifetimePostsPerDay ?? null;
  const ageDays = activity.accountAgeDays ?? null;
  if (
    lifetimeRate !== null &&
    Number.isFinite(lifetimeRate) &&
    lifetimeRate > frequencyThreshold &&
    ageDays !== null &&
    ageDays > 0
  ) {
    const excess = (lifetimeRate - frequencyThreshold) / Math.max(frequencyThreshold, 1);
    scores.push(clamped(0.6 + excess * 0.4));
    reasons.push(
      `posts ${Math.round(lifetimeRate)}/day across a ${Math.round(ageDays)}-day-old account`,
    );
  }

  const ratio = engagementRatio(post);
  const engagementThreshold = Math.max(0, thresholds.engagementRatioThreshold);
  const meaningfulEngagementFloor = Math.max(0, thresholds.meaningfulEngagementFloor);
  if (
    ratio !== null &&
    ratio < engagementThreshold &&
    engagementThreshold > 0 &&
    engagementStrength(post) < meaningfulEngagementFloor
  ) {
    scores.push(clamped((engagementThreshold - ratio) / engagementThreshold));
    reasons.push('high views with weak absolute engagement');
  }

  const values: Record<string, number | string | boolean | null> = {
    postsPerDay: recentRate,
    observedPostCount: activity.observedPostCount,
    observationWindowHours: activity.observationWindowHours,
    observedSpanHours: activity.observedSpanHours ?? null,
    distinctPostCount: activity.distinctPostCount,
    lifetimePostsPerDay: lifetimeRate,
    accountAgeDays: ageDays,
    engagementRatio: ratio,
    engagementStrength: engagementStrength(post),
  };
  const score =
    scores.length === 0 ? 0 : clamped(scores.reduce((total, s) => total + s, 0) / scores.length);
  return {
    layerId: 'behavioural',
    ok: true,
    score,
    reason: reasons.length === 0 ? null : reasons.join(' · '),
    detail: {
      status: 'scored',
      values,
    },
  };
}
