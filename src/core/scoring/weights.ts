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
  hideThreshold: 0.6,
  weights: {
    // Provisional HD-005 defaults: observable behavior remains the primary signal.
    behavioural: 0.4,
    provenance: 0.1,
    'content-type': 0.2,
    'image-forensics': 0.1,
    taste: 0.2,
  },
};

// HD-009 is unresolved; no veto can be safely inferred from the available layers.
export const VETO_RULES: readonly VetoRule[] = Object.freeze([]);
