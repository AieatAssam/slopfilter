import type { BehaviouralThresholds } from '@/core/signals/behavioural';
import type { ScoringConfig } from './types';

export const DEFAULT_THRESHOLDS: BehaviouralThresholds = {
  postsPerDayThreshold: 40,
  engagementRatioThreshold: 0.01,
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  hideThreshold: 0.6,
  weights: {
    behavioural: 1,
    provenance: 0,
    'content-type': 0,
    'image-forensics': 0,
    taste: 0,
  },
};
