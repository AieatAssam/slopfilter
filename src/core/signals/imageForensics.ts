import type { SignalResult } from '@/core/scoring/types';

export const MAX_IMAGES_PER_POST = 4;
export const IMAGE_FORENSICS_THRESHOLD = 0.8;

export interface ImageForensicsResult {
  ok: boolean;
  scores: readonly number[];
}

export const scoreImageForensics = (result: ImageForensicsResult): SignalResult => {
  if (!result.ok) {
    return {
      layerId: 'image-forensics',
      ok: false,
      score: 0,
      reason: null,
      detail: { status: 'unavailable', values: { sampleCount: result.scores.length } },
    };
  }
  const maximum = result.scores
    .slice(0, MAX_IMAGES_PER_POST)
    .reduce((best, score) => Math.max(best, score), 0);
  const values: Record<string, number | string | boolean | null> = {
    sampleCount: result.scores.length,
    maxScore: maximum,
    artefactThreshold: IMAGE_FORENSICS_THRESHOLD,
  };
  if (maximum < IMAGE_FORENSICS_THRESHOLD) {
    return {
      layerId: 'image-forensics',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'below-cutoff', values },
    };
  }
  return {
    layerId: 'image-forensics',
    ok: true,
    score: Math.max(0, Math.min(1, maximum)),
    reason: 'image shows generation artefacts',
    detail: { status: 'scored', values },
  };
};
