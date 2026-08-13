import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  FALSE_POSITIVE_CEILING,
  FIXTURE_NOW,
  MIN_CORPUS_ROWS,
  MIN_HARD_NEGATIVE_ROWS,
  MIN_SLOP_ROWS,
  readCorpus,
  scoreCorpus,
} from '../../../../scripts/calibration-scorer';

const corpus = readCorpus();

describe('SF-221 calibration corpus', () => {
  it('meets the committed corpus size floors', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(MIN_CORPUS_ROWS);
    expect(corpus.filter((row) => row.label === 'slop').length).toBeGreaterThanOrEqual(
      MIN_SLOP_ROWS,
    );
    expect(corpus.filter((row) => row.hardNegative).length).toBeGreaterThanOrEqual(
      MIN_HARD_NEGATIVE_ROWS,
    );
  });

  it('every row carries a label in the allowed set and a written rationale', () => {
    for (const row of corpus) {
      expect(['ordinary', 'slop']).toContain(row.label);
      expect(row.rationale.trim().length).toBeGreaterThan(0);
      expect(row.id.length).toBeGreaterThan(0);
    }
  });
});

describe('false-positive gate', () => {
  const defaultRun = scoreCorpus(corpus, FIXTURE_NOW, 0.6)[0];
  const disabledRun = scoreCorpus(corpus, FIXTURE_NOW, 0.6)[1];

  it('holds the false-positive ceiling at default settings', () => {
    expect(defaultRun.falsePositiveRate).toBeLessThanOrEqual(FALSE_POSITIVE_CEILING);
  });

  it('holds the false-positive ceiling with every model layer disabled', () => {
    expect(disabledRun.falsePositiveRate).toBeLessThanOrEqual(FALSE_POSITIVE_CEILING);
  });

  it('keeps every hard-negative row visible in both configurations', () => {
    for (const run of [defaultRun, disabledRun]) {
      for (const row of run.scored) {
        if (row.row.hardNegative) {
          expect(row.breakdown.hidden).toBe(false);
        }
      }
    }
  });

  it('prints per-signal fire counts for the behavioural and content-type layers', () => {
    const perLayer = Object.keys(defaultRun.fireCounts);
    expect(perLayer).toContain('behavioural');
    expect(perLayer).toContain('content-type');
  });
});

describe('calibration report process', () => {
  it('exits zero at default settings', () => {
    expect(() =>
      execFileSync('npm', ['run', 'calibration'], {
        stdio: 'pipe',
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
      }),
    ).not.toThrow();
  });

  it('exits non-zero on a deliberately broken threshold', () => {
    let failed = false;
    try {
      execFileSync('npm', ['run', 'calibration', '--', '--hide-threshold', '0'], {
        stdio: 'pipe',
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });
});
