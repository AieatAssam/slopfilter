import type { SignalResult } from '@/core/scoring/types';

const MAX_ITERATIONS = 20;

export const normaliseVector = (vector: Float32Array): Float32Array => {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return new Float32Array(vector);
  return Float32Array.from(vector, (value) => value / magnitude);
};

export const cosineSimilarity = (left: Float32Array, right: Float32Array): number => {
  if (left.length !== right.length || left.length === 0) return 0;
  const a = normaliseVector(left);
  const b = normaliseVector(right);
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
};

export const scoreTaste = (
  embedding: Float32Array,
  centroids: readonly Float32Array[],
  threshold: number,
): SignalResult => {
  const similarity = centroids.reduce(
    (best, centroid) => Math.max(best, cosineSimilarity(embedding, centroid)),
    0,
  );
  if (centroids.length === 0 || similarity < Math.max(0, threshold)) {
    return { layerId: 'taste', ok: true, score: 0, reason: null };
  }
  return {
    layerId: 'taste',
    ok: true,
    score: Math.max(0, Math.min(1, similarity)),
    reason: 'similar to posts you downvoted',
  };
};

const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const distanceSquared = (left: Float32Array, right: Float32Array): number =>
  left.reduce((sum, value, index) => {
    const difference = value - (right[index] ?? 0);
    return sum + difference * difference;
  }, 0);

export const recomputeCentroids = (
  vectors: readonly Float32Array[],
  k: number,
  seed: number,
): Float32Array[] => {
  if (vectors.length === 0 || k <= 0) return [];
  const first = vectors[0];
  if (!first) return [];
  const dimensions = first.length;
  if (dimensions === 0 || vectors.some((vector) => vector.length !== dimensions)) return [];

  const random = seededRandom(seed);
  const clusterCount = Math.min(Math.floor(k), vectors.length);
  const centroids = Array.from({ length: clusterCount }, () => {
    const vector = vectors[Math.floor(random() * vectors.length)] ?? first;
    return new Float32Array(vector);
  });

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const sums = centroids.map(() => new Float64Array(dimensions));
    const counts = centroids.map(() => 0);
    for (const vector of vectors) {
      let closest = 0;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < centroids.length; index += 1) {
        const distance = distanceSquared(vector, centroids[index] ?? new Float32Array(dimensions));
        if (distance < closestDistance) {
          closest = index;
          closestDistance = distance;
        }
      }
      const sum = sums[closest];
      if (!sum) continue;
      counts[closest] = (counts[closest] ?? 0) + 1;
      for (let dimension = 0; dimension < dimensions; dimension += 1) {
        sum[dimension] = (sum[dimension] ?? 0) + (vector[dimension] ?? 0);
      }
    }

    let changed = false;
    for (let index = 0; index < centroids.length; index += 1) {
      const count = counts[index] ?? 0;
      if (count === 0) continue;
      const next = Float32Array.from(sums[index] ?? [], (value) => value / count);
      if (distanceSquared(next, centroids[index] ?? next) > 1e-12) changed = true;
      centroids[index] = next;
    }
    if (!changed) break;
  }

  return centroids.map(normaliseVector);
};
