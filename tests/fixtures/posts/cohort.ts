import { DEFAULT_COHORT_CONFIG } from '@/core/scoring/weights';
import type { AuthorActivity } from '@/core/signals/behavioural';

// SF-217 calibration rows for scoreAccountCohort. Each row names the outcome it must reach: a
// strong fire, a weak fire, no fire, or no-data on a guard. Ages and creation dates are anchored to
// the DEFAULT_COHORT_CONFIG cutoff, never to the wall clock, so the recency ramp is stable forever.

export type CohortOutcome = 'strong' | 'weak' | 'no-fire' | 'no-data';

export interface CohortRow {
  id: string;
  outcome: CohortOutcome;
  chosenSource: 'recent' | 'lifetime' | null;
  derivation: string;
  stats: AuthorActivity;
}

const DAY = 86_400_000;
const cutoff = DEFAULT_COHORT_CONFIG.cutoff;

const stats = (overrides: Partial<AuthorActivity>): AuthorActivity => ({
  postsPerDay: null,
  observedPostCount: 0,
  observationWindowHours: 0,
  observedSpanHours: null,
  distinctPostCount: 0,
  lifetimePostsPerDay: null,
  accountAgeDays: null,
  accountCreatedAt: null,
  profilePostCount: null,
  ...overrides,
});

export const COHORT_ROWS: readonly CohortRow[] = [
  {
    id: 'young-high-volume-fires-strongly',
    outcome: 'strong',
    chosenSource: 'lifetime',
    derivation:
      '200-day account at a 60/day lifetime rate. Created long after the cutoff so recency is 1; ' +
      'volume sqrt((60-20)/80) = 0.707; 0.707 * 1 * weight 0.9 = 0.636, a strong fire.',
    stats: stats({
      accountAgeDays: 200,
      accountCreatedAt: cutoff + 500 * DAY,
      profilePostCount: 12_000,
      lifetimePostsPerDay: 60,
    }),
  },
  {
    id: 'old-moderate-volume-does-not-fire',
    outcome: 'no-fire',
    chosenSource: 'lifetime',
    derivation:
      '2638-day account at 13.7/day. Below the 20/day floor so the volume ramp is 0; the account is ' +
      'also far before the cutoff so recency is 0. The signal does not fire.',
    stats: stats({
      accountAgeDays: 2_638,
      accountCreatedAt: cutoff - 1_000 * DAY,
      profilePostCount: 36_193,
      lifetimePostsPerDay: 13.7,
    }),
  },
  {
    id: 'mid-volume-recent-rate-fires-weakly',
    outcome: 'strong',
    chosenSource: 'recent',
    derivation:
      '985-day account whose lifetime 14.5/day is below the floor, but the SF-215 recent rate of ' +
      '30/day is the higher and is chosen: volume sqrt((30-20)/80) = 0.354, recency 1, so 0.354 * ' +
      '0.9 = 0.318 is a strong fire.',
    stats: stats({
      accountAgeDays: 985,
      accountCreatedAt: cutoff + 200 * DAY,
      profilePostCount: 14_283,
      lifetimePostsPerDay: 14.5,
      postsPerDay: 30,
      observedPostCount: 3,
      observedSpanHours: 2,
      observationWindowHours: 2,
      distinctPostCount: 3,
    }),
  },
  {
    id: 'lifetime-rate-higher-chosen',
    outcome: 'strong',
    chosenSource: 'lifetime',
    derivation:
      'Recent rate 30/day but lifetime rate 60/day is the higher of the two, so the lifetime rate is ' +
      'chosen and the detail records the source.',
    stats: stats({
      accountAgeDays: 300,
      accountCreatedAt: cutoff + 500 * DAY,
      profilePostCount: 18_000,
      lifetimePostsPerDay: 60,
      postsPerDay: 30,
    }),
  },
  {
    id: 'age-guard-returns-no-data',
    outcome: 'no-data',
    chosenSource: null,
    derivation:
      'A 10-day account at 40/day is below minAccountAgeDays 14, so the signal returns no-data rather ' +
      'than extrapolating a rate from noise.',
    stats: stats({
      accountAgeDays: 10,
      accountCreatedAt: cutoff + 1_000 * DAY,
      profilePostCount: 400,
      lifetimePostsPerDay: 40,
    }),
  },
  {
    id: 'count-guard-returns-no-data',
    outcome: 'no-data',
    chosenSource: null,
    derivation:
      'A 400-day account with only 80 posts is below minPostCount 100, so the signal returns no-data.',
    stats: stats({
      accountAgeDays: 400,
      accountCreatedAt: cutoff + 500 * DAY,
      profilePostCount: 80,
      lifetimePostsPerDay: 20,
    }),
  },
  {
    id: 'just-above-floor-fires-weakly',
    outcome: 'weak',
    chosenSource: 'lifetime',
    derivation:
      '400-day account at a 21/day lifetime rate, one posting-rate step above the 20/day floor. ' +
      'Volume sqrt((21-20)/80) = 0.112, recency 1, so 0.112 * weight 0.9 = 0.101 fires weakly.',
    stats: stats({
      accountAgeDays: 400,
      accountCreatedAt: cutoff + 500 * DAY,
      profilePostCount: 8_400,
      lifetimePostsPerDay: 21,
    }),
  },
  {
    id: 'cutoff-ramp-one-day-before',
    outcome: 'strong',
    chosenSource: 'lifetime',
    derivation:
      'Created one day before the cutoff: the recency ramp is 1 - 1/180 = 0.9944. Volume ' +
      'sqrt((40-20)/80) = 0.5, so 0.5 * 0.9944 * weight 0.9 = 0.447 is a strong fire.',
    stats: stats({
      accountAgeDays: 1_500,
      accountCreatedAt: cutoff - DAY,
      profilePostCount: 60_000,
      lifetimePostsPerDay: 40,
    }),
  },
  {
    id: 'cutoff-ramp-one-day-after',
    outcome: 'strong',
    chosenSource: 'lifetime',
    derivation:
      'Created one day after the cutoff: recency 1. Volume sqrt((40-20)/80) = 0.5, so 0.5 * 0.9 = ' +
      '0.45 is a strong fire, within 0.01 of the one-day-before row.',
    stats: stats({
      accountAgeDays: 1_500,
      accountCreatedAt: cutoff + DAY,
      profilePostCount: 60_000,
      lifetimePostsPerDay: 40,
    }),
  },
  {
    id: 'missing-created-at-returns-no-data',
    outcome: 'no-data',
    chosenSource: null,
    derivation:
      'No account creation date is available, so the signal fails open to no-data rather than firing.',
    stats: stats({
      accountAgeDays: 200,
      accountCreatedAt: null,
      profilePostCount: 12_000,
      lifetimePostsPerDay: 60,
    }),
  },
];
