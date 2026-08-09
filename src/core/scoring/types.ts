export type LayerId = 'behavioural' | 'provenance' | 'content-type' | 'image-forensics' | 'taste';

export type SignalDetailStatus =
  | 'scored'
  | 'disabled'
  | 'unavailable'
  | 'gated'
  | 'below-cutoff'
  | 'no-data';

export interface SignalDetail {
  status: SignalDetailStatus;
  values?: Readonly<Record<string, number | string | boolean | null>>;
}

export interface SignalResult {
  layerId: LayerId;
  ok: boolean;
  score: number;
  reason: string | null;
  detail?: SignalDetail;
}

export interface ScoringConfig {
  hideThreshold: number;
  weights: Readonly<Record<LayerId, number>>;
}

export interface ScoreContribution {
  layerId: LayerId;
  score: number;
  weight: number;
  weighted: number;
  reason: string | null;
  detail?: SignalDetail;
}

export interface ScoreBreakdown {
  compositeScore: number;
  threshold: number;
  hidden: boolean;
  contributions: readonly ScoreContribution[];
  reasons: readonly string[];
  totalWeight?: number;
  requiredDelta?: number;
}
