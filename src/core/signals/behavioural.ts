import type { Post } from '@/core/post';
import type { SignalResult } from '@/core/scoring/types';

// A rate extrapolated from a span shorter than this is no-data, never a hide. Extrapolating
// 3 posts in 4 minutes to 1080 per day is how false positives happen.
export const MIN_OBSERVATION_SPAN_HOURS = 1;

// SF-216: an account younger than this is itself a slop signal, independent of any rate.
export const YOUNG_ACCOUNT_DAYS = 30;

export interface AuthorActivity {
  postsPerDay: number | null;
  observedPostCount: number;
  observationWindowHours: number;
  // SF-215: cache-derived observations carried alongside the in-viewport estimate.
  observedSpanHours: number | null;
  distinctPostCount: number;
  lifetimePostsPerDay: number | null;
  accountAgeDays: number | null;
  // SF-217: the payload profile inputs that make the cohort sub-signal computable. Null means the
  // payload did not carry them, and the cohort signal must fail open.
  accountCreatedAt: number | null;
  profilePostCount: number | null;
}

// SF-217: configures the graded account-cohort sub-signal. The cutoff is the account-creation date
// that separates the cohort from older accounts; the ramp makes that boundary continuous, and the
// volume floor/ceiling shape how much a high posting rate contributes. weight caps the sub-signal so
// a single maximal fire can never cross the hide threshold on its own.
export interface CohortConfig {
  cutoff: number;
  rampDays: number;
  volumeFloorPerDay: number;
  volumeCeilingPerDay: number;
  minAccountAgeDays: number;
  minPostCount: number;
  weight: number;
}

export interface BehaviouralThresholds {
  postsPerDayThreshold: number;
  engagementRatioThreshold: number;
  meaningfulEngagementFloor: number;
  cohort: CohortConfig;
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
    accountCreatedAt: profile.joinDate,
    profilePostCount: profile.postCount,
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
    accountCreatedAt: input.profileJoinDate,
    profilePostCount: input.profilePostCount,
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

const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const round3 = (value: number): number => round(value, 3);

// SF-217: a graded cohort-plus-volume sub-signal. A young account posting at industrial volume is the
// shape most content-farm output takes; neither fact alone carries it. The score is a volume ramp
// across the floor..ceiling range multiplied by a recency ramp across the cutoff window, so both the
// guards and the boundary are continuous. Unknown inputs, an account younger than the age floor, or a
// post count below the count floor all yield no-data: the signal fails open rather than guessing.
// The chosen rate is the higher of the SF-215 recent rate and the SF-216 lifetime rate, and the detail
// records which one was used.
export function scoreAccountCohort(stats: AuthorActivity, config: CohortConfig): SignalResult {
  const base = {
    layerId: 'behavioural' as const,
    ok: true,
    score: 0,
    reason: null,
  };
  const { accountAgeDays: ageDays, accountCreatedAt: createdAt, profilePostCount } = stats;
  if (ageDays == null || createdAt == null || profilePostCount == null) {
    return { ...base, detail: { status: 'no-data' } };
  }
  if (ageDays < config.minAccountAgeDays) {
    return { ...base, detail: { status: 'no-data' } };
  }
  if (profilePostCount < config.minPostCount) {
    return { ...base, detail: { status: 'no-data' } };
  }

  const candidates: { rate: number; source: 'recent' | 'lifetime' }[] = [];
  if (stats.postsPerDay !== null && Number.isFinite(stats.postsPerDay)) {
    candidates.push({ rate: stats.postsPerDay, source: 'recent' });
  }
  if (stats.lifetimePostsPerDay !== null && Number.isFinite(stats.lifetimePostsPerDay)) {
    candidates.push({ rate: stats.lifetimePostsPerDay, source: 'lifetime' });
  }
  if (candidates.length === 0) {
    return { ...base, detail: { status: 'no-data' } };
  }
  const chosen = candidates.reduce((best, candidate) =>
    candidate.rate > best.rate ? candidate : best,
  );

  const span = config.volumeCeilingPerDay - config.volumeFloorPerDay;
  const volume =
    span > 0
      ? clamped((chosen.rate - config.volumeFloorPerDay) / span)
      : chosen.rate >= config.volumeFloorPerDay
        ? 1
        : 0;
  const rampMs = config.rampDays * DAY_MS;
  const pastCutoff = createdAt - config.cutoff;
  const recency = pastCutoff >= 0 ? 1 : clamped(1 + pastCutoff / rampMs);

  const values: Record<string, number | string | boolean | null> = {
    accountAgeDays: round(ageDays),
    accountCreatedAt: new Date(createdAt).toISOString(),
    profilePostCount,
    recentPostsPerDay: stats.postsPerDay,
    lifetimePostsPerDay: stats.lifetimePostsPerDay,
    chosenRate: round(chosen.rate),
    rateSource: chosen.source,
    volumeFactor: round3(volume),
    recencyFactor: round3(recency),
  };

  if (volume <= 0) {
    return { ...base, detail: { status: 'below-cutoff', values } };
  }
  const score = clamped(volume * recency) * config.weight;
  const created = new Date(createdAt);
  const month = created.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const year = created.getUTCFullYear();
  const roundedRate = Math.round(chosen.rate);
  return {
    layerId: 'behavioural',
    ok: true,
    score,
    reason: `account created ${month} ${year}, posts ${roundedRate} times per day`,
    detail: { status: 'scored', values },
  };
}

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
  if (lifetimeRate !== null && Number.isFinite(lifetimeRate) && lifetimeRate > frequencyThreshold) {
    const excess = (lifetimeRate - frequencyThreshold) / Math.max(frequencyThreshold, 1);
    scores.push(clamped(0.6 + excess * 0.4));
    reasons.push(`posts ${Math.round(lifetimeRate)}/day across the account lifetime`);
  }

  // SF-216: a young account is its own signal, not just the denominator of the lifetime rate.
  // Posting heavily while young makes it a much stronger slop indicator than either fact alone.
  const ageDays = activity.accountAgeDays ?? null;
  if (ageDays !== null && Number.isFinite(ageDays) && ageDays > 0 && ageDays < YOUNG_ACCOUNT_DAYS) {
    const young = Math.round(ageDays);
    const heavyLifetime =
      lifetimeRate !== null && Number.isFinite(lifetimeRate) && lifetimeRate > frequencyThreshold;
    if (heavyLifetime) {
      scores.push(0.8);
      reasons.push(`account only ${young} days old posting ${Math.round(lifetimeRate)}/day`);
    } else {
      scores.push(0.35);
      reasons.push(`account only ${young} days old`);
    }
  }

  // SF-217: the graded cohort-plus-volume sub-signal. Its weighted score is folded in like any other
  // sub-signal, and its raw inputs ride in the layer values so the inspector can show why it fired.
  const cohortResult = scoreAccountCohort(activity, thresholds.cohort);
  if (cohortResult.score > 0 && cohortResult.reason) {
    scores.push(cohortResult.score);
    reasons.push(cohortResult.reason);
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
    ...(cohortResult.detail?.values ?? {}),
  };
  const score = scores.length === 0 ? 0 : clamped(Math.max(...scores));
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
