import { describe, expect, test } from 'vitest';
import {
  cosineSimilarity,
  normaliseVector,
  recomputeCentroids,
  scoreTaste,
} from '@/core/signals/taste';

describe('scoreTaste', () => {
  test('returns score 0 and reason null for empty centroids', () => {
    const result = scoreTaste(new Float32Array([1, 0]), [], 0.8);

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
    expect(Number.isNaN(result.score)).toBe(false);
  });

  test('computes cosine similarity correctly', () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBeCloseTo(1);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0);
  });

  test('is scale invariant', () => {
    const vector = new Float32Array([2, 1]);
    const centroid = [new Float32Array([2, 1])];

    expect(scoreTaste(vector, centroid, 0).score).toBeCloseTo(
      scoreTaste(new Float32Array([20, 10]), centroid, 0).score,
      6,
    );
  });

  test('does not fire below the threshold', () => {
    const result = scoreTaste(new Float32Array([1, 0]), [new Float32Array([0.8, 0.6])], 0.95);

    expect(result.score).toBe(0);
    expect(result.reason).toBeNull();
  });

  test('returns the fixed reason above the threshold', () => {
    const result = scoreTaste(new Float32Array([1, 0]), [new Float32Array([1, 0])], 0.95);

    expect(result.score).toBe(1);
    expect(result.reason).toBe('similar to posts you downvoted');
    expect(result.reason).not.toMatch(/\b(ai|generated|synthetic|authored)\b/i);
  });

  test('normaliseVector leaves a zero vector unchanged', () => {
    expect(normaliseVector(new Float32Array([0, 0]))).toEqual(new Float32Array([0, 0]));
  });
});

describe('recomputeCentroids', () => {
  test('is deterministic for a fixed seed', () => {
    const vectors = [
      new Float32Array([1, 0]),
      new Float32Array([0.9, 0.1]),
      new Float32Array([0, 1]),
      new Float32Array([0.1, 0.9]),
    ];

    expect(recomputeCentroids(vectors, 2, 7)).toEqual(recomputeCentroids(vectors, 2, 7));
  });

  test('returns an empty array for empty input', () => {
    expect(recomputeCentroids([], 2, 7)).toEqual([]);
  });
});
