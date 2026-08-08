import type { SignalResult } from '@/core/scoring/types';

export interface ProvenanceResult {
  imageCount: number;
  withManifest: number;
  withoutManifest: number;
  unreadable: number;
}

export const PROVENANCE_ABSENT_SCORE = 0.2;

export const scoreProvenance = (result: ProvenanceResult): SignalResult => {
  if (result.imageCount <= 0 || result.withManifest > 0) {
    return { layerId: 'provenance', ok: true, score: 0, reason: null };
  }
  if (result.unreadable >= result.imageCount) {
    return { layerId: 'provenance', ok: false, score: 0, reason: null };
  }
  return {
    layerId: 'provenance',
    ok: true,
    score: PROVENANCE_ABSENT_SCORE,
    reason: 'no content credentials',
  };
};
