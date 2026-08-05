import type { Post } from '@/core/post';
import type { SignalResult } from '@/core/scoring/types';

export interface AuthorActivity {
  postsPerDay: number | null;
  observedPostCount: number;
  observationWindowHours: number;
}

export interface BehaviouralThresholds {
  postsPerDayThreshold: number;
  engagementRatioThreshold: number;
}

const validTimestamp = (post: Post): number | null => {
  if (!post.postedAt) return null;
  const timestamp = Date.parse(post.postedAt);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export function deriveAuthorActivity(
  posts: readonly Post[],
  handle: string,
): AuthorActivity | null {
  const timestamps = posts
    .filter((post) => post.author.handle === handle)
    .map(validTimestamp)
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((left, right) => left - right);
  if (timestamps.length === 0) return null;

  const first = timestamps[0];
  const last = timestamps.at(-1);
  if (first === undefined || last === undefined) return null;
  const observationWindowHours = (last - first) / 3_600_000;
  const postsPerDay =
    timestamps.length > 1 && observationWindowHours > 0
      ? ((timestamps.length - 1) / observationWindowHours) * 24
      : null;

  return {
    postsPerDay,
    observedPostCount: timestamps.length,
    observationWindowHours,
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

const clamped = (value: number): number => Math.max(0, Math.min(1, value));

export function scoreBehavioural(
  post: Post,
  activity: AuthorActivity | null,
  thresholds: BehaviouralThresholds,
): SignalResult {
  if (!activity) return { layerId: 'behavioural', ok: true, score: 0, reason: null };

  const scores: number[] = [];
  const reasons: string[] = [];
  const frequencyThreshold = Math.max(0, thresholds.postsPerDayThreshold);
  if (
    activity.postsPerDay !== null &&
    Number.isFinite(activity.postsPerDay) &&
    activity.postsPerDay > frequencyThreshold
  ) {
    const excess = (activity.postsPerDay - frequencyThreshold) / Math.max(frequencyThreshold, 1);
    scores.push(clamped(0.6 + excess * 0.4));
    reasons.push(`posts ${Math.round(activity.postsPerDay)}+ times per day`);
  }

  const ratio = engagementRatio(post);
  const engagementThreshold = Math.max(0, thresholds.engagementRatioThreshold);
  if (ratio !== null && ratio < engagementThreshold && engagementThreshold > 0) {
    scores.push(clamped((engagementThreshold - ratio) / engagementThreshold));
    reasons.push('high views, very little engagement');
  }

  if (scores.length === 0) return { layerId: 'behavioural', ok: true, score: 0, reason: null };
  return {
    layerId: 'behavioural',
    ok: true,
    score: clamped(scores.reduce((total, score) => total + score, 0) / scores.length),
    reason: reasons.join(' · '),
  };
}
