import type { SignalResult } from '@/core/scoring/types';
import { cosineSimilarity } from './taste';

// SF-219: near-duplicate and templated posts. Pure string and vector analysis; the embedder runs in
// the inference worker and its vectors arrive precomputed. No chrome.*, no DOM, no IndexedDB.

export interface RepetitionConfig {
  minTextLength: number;
  simhashHammingGate: number;
  cosineThreshold: number;
  clusterFloor: number;
  corpusCap: number;
}

export interface RepetitionTarget {
  handle: string;
  embedding: Float32Array | null;
  simhash: bigint;
  textLength: number;
}

export interface RepetitionCorpusEntry {
  postId: string;
  handle: string;
  embedding: Float32Array;
  simhash: bigint;
  observedAt: number;
}

const FNV_OFFSET_BASIS = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x100_0000_01b3n;

const fnv1a64 = (input: string): bigint => {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * FNV_PRIME) & 0xffff_ffff_ffff_ffffn;
  }
  return hash;
};

// Character 5-gram simhash over lowercased, whitespace-normalised text. Near-identical texts land
// near each other; a cheap Hamming gate then selects which corpus entries deserve a cosine pass.
export const simhash64 = (text: string): bigint => {
  const normalised = text.toLowerCase().replace(/\s+/g, ' ');
  const grams: string[] = [];
  if (normalised.length < 5) {
    if (normalised.length > 0) grams.push(normalised);
  } else {
    for (let index = 0; index + 5 <= normalised.length; index += 1) {
      grams.push(normalised.slice(index, index + 5));
    }
  }
  const votes = new Int32Array(64);
  for (const gram of grams) {
    const feature = fnv1a64(gram);
    for (let bit = 0; bit < 64; bit += 1) {
      if (((feature >> BigInt(bit)) & 1n) === 1n) votes[bit] = (votes[bit] ?? 0) + 1;
      else votes[bit] = (votes[bit] ?? 0) - 1;
    }
  }
  let result = 0n;
  for (let bit = 0; bit < 64; bit += 1) {
    if ((votes[bit] ?? 0) > 0) result |= 1n << BigInt(bit);
  }
  return result;
};

export const hammingDistance = (left: bigint, right: bigint): number => {
  let difference = left ^ right;
  let count = 0;
  while (difference !== 0n) {
    count += 1;
    difference &= difference - 1n;
  }
  return count;
};

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const clamped = (value: number): number => Math.max(0, Math.min(1, value));

export function scoreRepetition(
  target: RepetitionTarget,
  corpus: readonly RepetitionCorpusEntry[],
  config: RepetitionConfig,
): SignalResult {
  const values: Record<string, number | string | boolean | null> = {
    textLength: target.textLength,
    minTextLength: config.minTextLength,
    corpusSize: corpus.length,
    clusterSize: 0,
    distinctHandles: 0,
    similarity: 0,
    matchedCount: 0,
    hammingCandidates: 0,
    subSignal: null,
  };
  if (target.textLength < config.minTextLength) {
    return {
      layerId: 'repetition',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'no-data', values },
    };
  }
  if (!target.embedding) {
    return {
      layerId: 'repetition',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'unavailable', values },
    };
  }
  if (corpus.length === 0) {
    return {
      layerId: 'repetition',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'no-data', values },
    };
  }

  const embedding = target.embedding;
  const hammingCandidates = corpus
    .filter((entry) => hammingDistance(target.simhash, entry.simhash) <= config.simhashHammingGate)
    .map((entry) => ({ entry, similarity: cosineSimilarity(embedding, entry.embedding) }));
  values.hammingCandidates = hammingCandidates.length;
  if (hammingCandidates.length === 0) {
    return {
      layerId: 'repetition',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'below-cutoff', values },
    };
  }

  const matched = hammingCandidates.filter(
    (candidate) => candidate.similarity >= config.cosineThreshold,
  );
  values.matchedCount = matched.length;
  if (matched.length === 0) {
    values.similarity = mean(hammingCandidates.map((candidate) => candidate.similarity));
    return {
      layerId: 'repetition',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'below-cutoff', values },
    };
  }

  const clusterSize = matched.length + 1;
  const distinctHandles = new Set(matched.map((match) => match.entry.handle)).size;
  const similarity = mean(matched.map((match) => match.similarity));
  values.clusterSize = clusterSize;
  values.distinctHandles = distinctHandles;
  values.similarity = similarity;
  if (clusterSize < config.clusterFloor) {
    return {
      layerId: 'repetition',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'below-cutoff', values },
    };
  }

  const sameAuthorOnly = matched.every((match) => match.entry.handle === target.handle);
  if (sameAuthorOnly) {
    values.subSignal = 'author-self-repetition';
    return {
      layerId: 'repetition',
      ok: true,
      score: clamped(similarity * 0.25),
      reason: `near-identical to ${matched.length} earlier posts by the same author`,
      detail: { status: 'scored', values },
    };
  }

  values.subSignal = 'cross-account-repetition';
  const sizeGrade = Math.min(1, (clusterSize - (config.clusterFloor - 1)) / 6);
  const handleGrade = Math.min(1, distinctHandles / 4);
  const score = similarity * (0.4 + 0.6 * sizeGrade) * (0.5 + 0.5 * handleGrade);
  return {
    layerId: 'repetition',
    ok: true,
    score: clamped(score),
    reason: `near-identical to ${matched.length} other posts in this feed`,
    detail: { status: 'scored', values },
  };
}
