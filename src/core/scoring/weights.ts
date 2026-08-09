import type { BehaviouralThresholds } from '@/core/signals/behavioural';
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
