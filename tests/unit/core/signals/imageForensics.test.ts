import { describe, expect, test } from 'vitest';
import {
  IMAGE_FORENSICS_THRESHOLD,
  MAX_IMAGES_PER_POST,
  scoreImageForensics,
} from '@/core/signals/imageForensics';

describe('scoreImageForensics', () => {
  test('returns score 0 and reason null below the confidence threshold', () => {
    const result = scoreImageForensics({
      ok: true,
      scores: [IMAGE_FORENSICS_THRESHOLD - 0.01],
    });

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('returns a bounded score and fixed reason above the threshold', () => {
    const result = scoreImageForensics({ ok: true, scores: [0.9] });

    expect(result.score).toBe(0.9);
    expect(result.reason).toBe('image shows generation artefacts');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  test('returns ok false when the model failed', () => {
    expect(scoreImageForensics({ ok: false, scores: [1] })).toEqual({
      layerId: 'image-forensics',
      ok: false,
      score: 0,
      reason: null,
    });
  });

  test('uses the maximum score and caps the number of images considered', () => {
    const result = scoreImageForensics({
      ok: true,
      scores: [0.1, 0.2, 0.3, 0.4, 0.99, ...Array(MAX_IMAGES_PER_POST).fill(0.95)],
    });

    expect(result.score).toBe(0);
  });

  test('uses the maximum per-image score rather than the mean', () => {
    const result = scoreImageForensics({ ok: true, scores: [0.9, 0.1, 0.1, 0.1] });

    expect(result.score).toBe(0.9);
  });
});
