import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Post } from '@/core/post';
import { scorePost } from '@/core/scoring/pipeline';
import type { ScoreBreakdown, SignalResult } from '@/core/scoring/types';
import {
  CONTENT_FORMAT_DEFAULTS,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_THRESHOLDS,
  REPETITION_DEFAULTS,
} from '@/core/scoring/weights';
import { deriveAuthorActivityFromCache, scoreBehavioural } from '@/core/signals/behavioural';
import { scoreContentFormat } from '@/core/signals/contentType';
import { scoreRepetition, simhash64 } from '@/core/signals/repetition';
import { LAYER_IDS } from '@/storage/settings';

// SF-221: the calibration report scores every corpus row through the real pipeline (scorePost,
// scoreBehavioural, scoreContentFormat, scoreRepetition) with per-author activity derived from the
// same cache-input shape the content script uses. The corpus is a fixture, not a model: nothing here
// trains or fits anything. All numbers are provisional under HD-005.
//
// Both configurations are evaluated. The models-disabled configuration is the first-run state, and
// because no model artifacts are committed, the two runs exercise the identical deterministic signal
// set here; the report prints both tables and the gate holds the false-positive ceiling for each.

export const FIXTURE_NOW = Date.parse('2026-08-08T12:00:00.000Z');

export const MIN_CORPUS_ROWS = 120;
export const MIN_SLOP_ROWS = 40;
export const MIN_HARD_NEGATIVE_ROWS = 40;
export const FALSE_POSITIVE_CEILING = 0.05;

export interface CorpusAuthor {
  handle: string;
  cadenceMinutes?: number;
  accountCreatedAt?: string;
  profilePostCount?: number;
}

export interface CorpusEngagement {
  replies: number;
  reposts: number;
  likes: number;
  views: number | null;
}

export interface CorpusRow {
  id: string;
  source: string;
  text: string;
  author: CorpusAuthor;
  engagement: CorpusEngagement;
  label: 'ordinary' | 'slop';
  hardNegative: boolean;
  rationale: string;
}

export interface CalibrationRun {
  name: string;
  enabledLayers: Record<string, boolean>;
  hideThreshold: number;
  scored: ScoredRow[];
  falsePositiveRate: number;
  falsePositives: ScoredRow[];
  recall: number;
  misses: ScoredRow[];
  fireCounts: Record<string, number>;
}

export interface ScoredRow {
  row: CorpusRow;
  breakdown: ScoreBreakdown;
  signals: readonly SignalResult[];
  activityDetails: Record<string, number | null> | null;
}

export const readCorpus = (): readonly CorpusRow[] => {
  const path = resolve(process.cwd(), 'tests/fixtures/posts/corpus.json');
  const parsed: { meta?: Record<string, unknown>; rows: readonly CorpusRow[] } = JSON.parse(
    readFileSync(path, 'utf8'),
  );
  return parsed.rows;
};

const DEFAULT_ENABLED: Record<string, boolean> = Object.fromEntries(
  LAYER_IDS.map((layerId) => [layerId, true]),
);

const MODELS_DISABLED_ENABLED: Record<string, boolean> = Object.fromEntries(
  LAYER_IDS.map((layerId) => [
    layerId,
    ['behavioural', 'content-type', 'repetition'].includes(layerId),
  ]),
);

const postFor = (row: CorpusRow, now: number): Post => ({
  id: row.id,
  permalink: null,
  text: row.text,
  postedAt: new Date(now).toISOString(),
  author: { handle: row.author.handle, displayName: row.author.handle, profileUrl: null },
  engagement: { ...row.engagement },
  imageUrls: [],
  hasVideo: false,
});

interface AuthorInput {
  firstSeen: number;
  lastSeen: number;
  posts: Record<string, number>;
  profileJoinDate: number | null;
  profilePostCount: number | null;
}

const collectAuthorInputs = (
  rows: readonly CorpusRow[],
  now: number,
): Map<string, { input: AuthorInput; rows: CorpusRow[] }> => {
  const sightings = new Map<string, { posts: Record<string, number>; handle: string }>();
  rows.forEach((row, index) => {
    const existing = sightings.get(row.author.handle) ?? { posts: {}, handle: row.author.handle };
    const cadenceMinutes = row.author.cadenceMinutes ?? 18;
    const timestamp = now - index * cadenceMinutes * 60_000;
    existing.posts[row.id] = timestamp;
    sightings.set(row.author.handle, existing);
  });
  const out = new Map<string, { input: AuthorInput; rows: CorpusRow[] }>();
  for (const [handle, sighting] of sightings) {
    const timestamps = Object.values(sighting.posts).filter((value): value is number =>
      Number.isFinite(value),
    );
    const first = Math.min(...timestamps);
    const last = Math.max(...timestamps);
    const firstRow = rows.find((row) => row.author.handle === handle);
    const createdAt =
      firstRow?.author.accountCreatedAt !== undefined
        ? Date.parse(firstRow.author.accountCreatedAt)
        : null;
    out.set(handle, {
      input: {
        firstSeen: first,
        lastSeen: last,
        posts: sighting.posts,
        profileJoinDate: Number.isFinite(createdAt as number) ? (createdAt as number) : null,
        profilePostCount: firstRow?.author.profilePostCount ?? null,
      },
      rows: rows.filter((row) => row.author.handle === handle),
    });
  }
  return out;
};

const scoreRow = (
  row: CorpusRow,
  now: number,
  enabledLayers: Record<string, boolean>,
  hideThreshold: number,
  activity: ReturnType<typeof deriveAuthorActivityFromCache>,
): ScoredRow | null => {
  const post = postFor(row, now);
  const behaviouralSignal = scoreBehavioural(post, activity, DEFAULT_THRESHOLDS);
  const formatSignal = scoreContentFormat(post.text, CONTENT_FORMAT_DEFAULTS);
  const repetitionSignal = scoreRepetition(
    {
      handle: row.author.handle,
      embedding: null,
      simhash: simhash64(post.text),
      textLength: post.text.length,
    },
    [],
    REPETITION_DEFAULTS,
  );
  const signals = [behaviouralSignal, formatSignal, repetitionSignal].filter(
    (result) => enabledLayers[result.layerId],
  );
  const breakdown = scorePost(post, signals, {
    hideThreshold,
    weights: DEFAULT_SCORING_CONFIG.weights,
  });
  return {
    row,
    breakdown,
    signals,
    activityDetails: null,
  };
};

export const scoreCorpus = (
  corpus: readonly CorpusRow[],
  now: number,
  hideThreshold: number,
): readonly [CalibrationRun, CalibrationRun] => {
  const byAuthor = collectAuthorInputs(corpus, now);
  const runFor = (name: string, enabledLayers: Record<string, boolean>): CalibrationRun => {
    const scored: ScoredRow[] = [];
    for (const row of corpus) {
      const holder = byAuthor.get(row.author.handle);
      const activity = holder ? deriveAuthorActivityFromCache(holder.input, now) : null;
      const scoredRow = scoreRow(row, now, enabledLayers, hideThreshold, activity);
      if (scoredRow) scored.push(scoredRow);
    }
    const guard = (row: ScoredRow): boolean => row.row.label === 'ordinary' && row.breakdown.hidden;
    const falsePositives = scored.filter(guard);
    const misses = scored.filter((row) => row.row.label === 'slop' && !row.breakdown.hidden);
    const falsePositiveRate =
      falsePositives.length /
      Math.max(scored.filter((row) => row.row.label === 'ordinary').length, 1);
    const slopRows = scored.filter((row) => row.row.label === 'slop');
    const recall =
      slopRows.length === 0
        ? 0
        : slopRows.filter((row) => row.breakdown.hidden).length / slopRows.length;
    const fireCounts: Record<string, number> = {};
    for (const row of scored) {
      for (const signal of row.signals) {
        if (signal.ok && signal.score > 0) {
          fireCounts[signal.layerId] = (fireCounts[signal.layerId] ?? 0) + 1;
        }
      }
    }
    return {
      name,
      enabledLayers,
      hideThreshold,
      scored,
      falsePositiveRate,
      falsePositives,
      recall,
      misses,
      fireCounts,
    };
  };

  return [
    runFor('default-settings', DEFAULT_ENABLED),
    runFor('models-disabled', MODELS_DISABLED_ENABLED),
  ] as readonly [CalibrationRun, CalibrationRun];
};
