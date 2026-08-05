export type LayerId = 'behavioural' | 'provenance' | 'content-type' | 'image-forensics' | 'taste';

export interface SignalResult {
  layerId: LayerId;
  ok: boolean;
  score: number;
  reason: string | null;
}

export interface ScoringConfig {
  hideThreshold: number;
  weights: Readonly<Record<LayerId, number>>;
}

export interface ScoreBreakdown {
  compositeScore: number;
  threshold: number;
  hidden: boolean;
  contributions: readonly {
    layerId: LayerId;
    score: number;
    weight: number;
    weighted: number;
    reason: string | null;
  }[];
  reasons: readonly string[];
}
