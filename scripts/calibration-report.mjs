// SF-221 calibration report. Runs every committed corpus row through the real pipeline at
// default settings and at models-disabled settings, prints the false-positive rate, recall,
// per-signal fire counts, and every misclassified row with its rationale, then exits non-zero
// when the false-positive ceiling is breached or the corpus falls below its size floors.
//
// Run: npm run calibration  (compiles scripts/calibration-scorer.ts, then this file).
// The bundle is produced first so this script stays a thin printer; the scoring itself lives in
// the TypeScript source that the whole repo typechecks.

import {
  FALSE_POSITIVE_CEILING,
  FIXTURE_NOW,
  MIN_CORPUS_ROWS,
  MIN_HARD_NEGATIVE_ROWS,
  MIN_SLOP_ROWS,
  readCorpus,
  scoreCorpus,
} from '../dist-calibration/calibration-scorer.js';

const args = process.argv.slice(2);
const thresholdIndex = args.indexOf('--hide-threshold');
const hideThreshold =
  thresholdIndex >= 0 && args[thresholdIndex + 1] !== undefined
    ? Number(args[thresholdIndex + 1])
    : 0.6;

const corpus = readCorpus();
const slopCount = corpus.filter((row) => row.label === 'slop').length;
const hardNegativeCount = corpus.filter((row) => row.hardNegative).length;
const floorViolation =
  corpus.length < MIN_CORPUS_ROWS ||
  slopCount < MIN_SLOP_ROWS ||
  hardNegativeCount < MIN_HARD_NEGATIVE_ROWS;

const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

console.log(`SF-221 calibration report`);
console.log(
  `corpus: ${corpus.length} rows (${slopCount} slop, ${hardNegativeCount} hard-negative)`,
);
console.log(`hide threshold: ${hideThreshold} (default ${0.6})`);
console.log('');

const runs = scoreCorpus(corpus, FIXTURE_NOW, hideThreshold);
let breached = false;

for (const run of runs) {
  console.log(`--- ${run.name}`);
  const fp = round(run.falsePositiveRate);
  const recall = round(run.recall);
  const enabled = Object.entries(run.enabledLayers)
    .filter(([, on]) => on)
    .map(([layer]) => layer)
    .join(', ');
  const fireCounts = Object.entries(run.fireCounts)
    .map(([layer, count]) => `${layer}: ${count}`)
    .join(', ');
  const hidden = run.scored.filter((row) => row.breakdown.hidden).length;
  console.log(
    `false positives: ${run.falsePositives.length}/${run.scored.length} (rate ${fp}, ceiling ${FALSE_POSITIVE_CEILING})`,
  );
  console.log(`recall: ${recall}`);
  console.log(`hidden: ${hidden}/${run.scored.length}`);
  console.log(`enabled layers: ${enabled}`);
  console.log(`per-signal fires: ${fireCounts || 'none'}`);
  if (run.falsePositives.length > 0) {
    console.log('false positives:');
    for (const row of run.falsePositives) {
      console.log(
        `  ${row.row.id} (${row.row.hardNegative ? 'hard-negative' : 'ordinary'}) composite ${round(row.breakdown.compositeScore)}`,
      );
      console.log(`    reasons: ${row.breakdown.reasons.join(' | ')}`);
      console.log(`    rationale: ${row.row.rationale}`);
    }
  }
  if (run.misses.length > 0) {
    console.log('slop not hidden (misses, non-blocking):');
    for (const row of run.misses) {
      console.log(`  ${row.row.id} composite ${round(row.breakdown.compositeScore)}`);
      console.log(`    reasons: ${row.breakdown.reasons.join(' | ')}`);
      console.log(`    rationale: ${row.row.rationale}`);
    }
  }
  if (run.falsePositiveRate > FALSE_POSITIVE_CEILING) breached = true;
  console.log('');
}

if (floorViolation) {
  console.log(
    `FLOOR VIOLATION: require ${MIN_CORPUS_ROWS} rows, ${MIN_SLOP_ROWS} slop, ${MIN_HARD_NEGATIVE_ROWS} hard-negative`,
  );
}
if (breached) {
  console.log(`FALSE-POSITIVE CEILING BREACHED`);
}

process.exitCode = floorViolation || breached ? 1 : 0;
