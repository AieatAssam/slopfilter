import { describe, expect, test } from 'vitest';
import { scoreProvenance } from '@/core/signals/provenance';

describe('scoreProvenance', () => {
  test('a valid manifest yields score 0 and reason null', () => {
    expect(
      scoreProvenance({ imageCount: 1, withManifest: 1, withoutManifest: 0, unreadable: 0 }),
    ).toEqual({
      layerId: 'provenance',
      ok: true,
      score: 0,
      reason: null,
      detail: {
        status: 'scored',
        values: { imageCount: 1, withManifest: 1, withoutManifest: 0, unreadable: 0 },
      },
    });
  });

  test('absent credentials yield a small score with the exact reason', () => {
    const result = scoreProvenance({
      imageCount: 2,
      withManifest: 0,
      withoutManifest: 2,
      unreadable: 0,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(0.5);
    expect(result.reason).toBe('no content credentials');
  });

  test('an unreadable manifest yields ok false', () => {
    expect(
      scoreProvenance({ imageCount: 1, withManifest: 0, withoutManifest: 0, unreadable: 1 }),
    ).toEqual({
      layerId: 'provenance',
      ok: false,
      score: 0,
      reason: null,
      detail: {
        status: 'unavailable',
        values: { imageCount: 1, withManifest: 0, withoutManifest: 0, unreadable: 1 },
      },
    });
  });

  test('a post with no images contributes nothing', () => {
    expect(
      scoreProvenance({ imageCount: 0, withManifest: 0, withoutManifest: 0, unreadable: 0 }),
    ).toEqual({
      layerId: 'provenance',
      ok: true,
      score: 0,
      reason: null,
      detail: {
        status: 'no-data',
        values: { imageCount: 0, withManifest: 0, withoutManifest: 0, unreadable: 0 },
      },
    });
  });

  test('never returns an authorship claim', () => {
    const result = scoreProvenance({
      imageCount: 1,
      withManifest: 0,
      withoutManifest: 1,
      unreadable: 0,
    });

    expect(result.reason).not.toMatch(/\b(ai|generated|synthetic|authored)\b/i);
  });
});
