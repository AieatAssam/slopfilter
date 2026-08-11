import type { BehaviouralThresholds, CohortConfig } from '@/core/signals/behavioural';
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
    weight: 0.5,
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
  },
};

// HD-009 is unresolved; no veto can be safely inferred from the available layers.
export const VETO_RULES: readonly VetoRule[] = Object.freeze([]);
