import type { BehaviouralThresholds, CohortConfig } from '@/core/signals/behavioural';
import type { ContentFormatConfig } from '@/core/signals/contentType';
import type { RepetitionConfig } from '@/core/signals/repetition';
import type { TextPatternConfig } from '@/core/signals/textPattern';
import type { ScoringConfig, SignalResult } from './types';

export interface VetoRule {
  id: string;
  applies: (results: readonly SignalResult[]) => boolean;
  reason: string;
}

export const DEFAULT_THRESHOLDS: BehaviouralThresholds = {
  postsPerDayThreshold: 40,
  engagementRatioThreshold: 0.01,
  meaningfulEngagementFloor: 50,
  cohort: {
    cutoff: Date.parse('2022-11-30T00:00:00.000Z'),
    rampDays: 180,
    volumeFloorPerDay: 20,
    volumeCeilingPerDay: 100,
    minAccountAgeDays: 14,
    minPostCount: 100,
    // Provisional HD-005: the max (0.9 × 0.6 = 0.54) stays below the 0.60 hide threshold, so cohort
    // alone never hides a post.
    weight: 0.9,
  },
};

// SF-217: the three user-tunable cohort values the options page writes. They replace the matching
// DEFAULT_THRESHOLDS.cohort fields; the recency ramp, guards, and weight are deliberate and stay
// fixed. cutoff stays 2022-11-30 (the public ChatGPT launch) unless the user changes it.
export const DEFAULT_COHORT_CONFIG: CohortConfig = DEFAULT_THRESHOLDS.cohort;

export interface CohortSettingsInput {
  cohortCutoff: string;
  cohortVolumeFloor: number;
  cohortVolumeCeiling: number;
}

export const behaviouralThresholds = (settings: CohortSettingsInput): BehaviouralThresholds => {
  const parsedCutoff = Date.parse(settings.cohortCutoff);
  const floor = Math.max(0, settings.cohortVolumeFloor);
  const ceiling = Math.max(0, settings.cohortVolumeCeiling);
  return {
    ...DEFAULT_THRESHOLDS,
    cohort: {
      ...DEFAULT_THRESHOLDS.cohort,
      cutoff: Number.isFinite(parsedCutoff) ? parsedCutoff : DEFAULT_THRESHOLDS.cohort.cutoff,
      volumeFloorPerDay: floor,
      volumeCeilingPerDay: Math.max(floor, ceiling),
    },
  };
};

// Provisional HD-005 (SF-220): structural engagement-bait feature weights and thresholds. The cap is
// above the 0.6 hide threshold for three or more features and below it for any single one, so the
// signal accumulates across features but never fires alone.
export const CONTENT_FORMAT_DEFAULTS: ContentFormatConfig = {
  hashtagThreshold: 6,
  mentionThreshold: 4,
  listRunFloor: 3,
  hookLineMaxChars: 80,
  // t.co is X's own rewriter applied to every link, so it is excluded: it is not a distinguishing
  // feature. The remaining hosts are the common third-party shorteners.
  linkShortenerHosts: Object.freeze([
    'bit.ly',
    'tinyurl.com',
    'goo.gl',
    'buff.ly',
    'lnkd.in',
    'cutt.ly',
    'ow.ly',
    'shorturl.at',
    'rb.gy',
    'rebrand.ly',
  ]),
  featureWeights: Object.freeze({
    callToAction: 0.35,
    hashtagStuffing: 0.3,
    mentionStuffing: 0.25,
    listRun: 0.2,
    hookThenList: 0.25,
    allCapsOpener: 0.15,
    linkShortener: 0.2,
    // Provisional HD-005: a single stock hook is a moderate fire (0.125 composite).
    viralHook: 0.25,
    // Provisional HD-005: a keyword-for-send offer is a strong, specific shape on its own.
    keywordExchange: 0.35,
    // Provisional HD-005: urgency only counts beside a request, so it stays a modest contributor.
    urgencyWithAsk: 0.2,
  }),
  scoreCap: 0.85,
};

// Provisional HD-005 (SF-219): near-duplicate and templated post thresholds. minTextLength skips
// short texts before any vector work; the simhash Hamming gate is the cheap prefilter and cosine
// runs only on the entries that survive it. clusterFloor stops a single near pair from firing, and
// corpusCap bounds the recent-post corpus with oldest-first eviction.
export const REPETITION_DEFAULTS: RepetitionConfig = {
  minTextLength: 60,
  simhashHammingGate: 12,
  cosineThreshold: 0.93,
  clusterFloor: 3,
  corpusCap: 500,
};

// Provisional HD-005/HD-017: the optional detector skips short posts and its score is capped by
// the layer weight below the 0.6 hide threshold. It is disabled for existing and new installs.
export const TEXT_PATTERN_DEFAULTS: TextPatternConfig & { weightCap: number; enabled: boolean } = {
  minChars: 180,
  weightCap: 0.4,
  enabled: false,
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  // Provisional HD-005 recalibration (SF-214): weights are additive contributions toward the
  // threshold, not shares of a mean. Measured 2026-08-08: the old 0.40/0.20/0.10 weights capped a
  // lone scored layer at 0.5 of 0.8 usable weight, so no single strong layer could ever hide a
  // post once the model layers reported zero. These numbers make a maximal behavioural signal
  // alone cross the 0.6 threshold. Owner sign-off still pending.
  hideThreshold: 0.6,
  weights: {
    behavioural: 0.6,
    provenance: 0.2,
    'content-type': 0.5,
    'image-forensics': 0.4,
    taste: 0.5,
    // SF-219: one maximal repetition fire (1.0 * 0.3 = 0.3) must stay under the 0.6 threshold, so
    // repetition alone can never hide a post. It exists to lift quiet layers, not to decide alone.
    repetition: 0.3,
    'text-pattern': TEXT_PATTERN_DEFAULTS.weightCap,
  },
};

// HD-009 is unresolved; no veto can be safely inferred from the available layers.
export const VETO_RULES: readonly VetoRule[] = Object.freeze([]);
