import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const target = targetIndex >= 0 ? args[targetIndex + 1] : undefined;
const fixtureIndex = args.indexOf('--fixture');
const fixturePath = fixtureIndex >= 0 ? args[fixtureIndex + 1] : undefined;
const breakIndex = args.indexOf('--break');
const breakEntryId = breakIndex >= 0 ? args[breakIndex + 1] : undefined;
const outIndex = args.indexOf('--out');
const reportPath = resolve(
  outIndex >= 0 ? (args[outIndex + 1] ?? 'drift-report.json') : 'drift-report.json',
);

const SEGMENT_RE = /^([^[]+)(\[])?$/;

const resolvePath = (root, path) => {
  const segments = path.split('.');
  let values = [root];
  for (const raw of segments) {
    const match = SEGMENT_RE.exec(raw);
    if (!match) return [];
    const key = match[1];
    const iterate = match[2] === '[]';
    const next = [];
    for (const value of values) {
      if (typeof value !== 'object' || value === null) continue;
      const child = value[key];
      if (!iterate) {
        if (child !== undefined) next.push(child);
        continue;
      }
      if (Array.isArray(child)) next.push(...child);
    }
    values = next;
    if (values.length === 0) return [];
  }
  return values;
};

const resolveEntry = (context, entry) => {
  for (const path of entry.paths) {
    const hits = resolvePath(context, path);
    if (hits.length > 0) return hits;
  }
  return [];
};

const payloadFailures = (contract, fixture, brokenId) => {
  const byId = (id) => contract.entries.find((c) => c.id === id);
  const entries =
    byId('entries') !== undefined ? resolveEntry(fixture, byId('entries')) : [fixture];
  const tweets = entries.flatMap((entry) =>
    byId('tweet') !== undefined ? resolveEntry(entry, byId('tweet')) : [],
  );
  const users = tweets.flatMap((tweet) =>
    byId('user') !== undefined ? resolveEntry(tweet, byId('user')) : [],
  );
  const contexts = { entry: entries, tweet: tweets, user: users };

  const failures = [];
  for (const entry of contract.entries) {
    if (!entry.required) continue;
    let resolved = false;
    if (entry.context === 'document') {
      resolved = resolveEntry(fixture, entry).length > 0;
    } else if (contexts[entry.context] !== undefined) {
      resolved = contexts[entry.context].some(
        (candidate) => resolveEntry(candidate, entry).length > 0,
      );
    }
    if (brokenId === entry.id) resolved = false;
    if (!resolved) failures.push(entry.id);
  }
  return failures;
};

if (!target && !fixturePath) {
  console.error(
    'usage: node scripts/check-drift.mjs --target <url> [--fixture <payload.json>] [--break <entryId>] [--out <path>]',
  );
  process.exitCode = 1;
} else if (fixturePath) {
  const contract = JSON.parse(readFileSync('src/adapters/x/payloadContract.json', 'utf8'));
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const failures = payloadFailures(contract, fixture, breakEntryId);
  const report = {
    contractVersion: contract.contractVersion,
    fixture: fixturePath,
    status: failures.length === 0 ? 'ok' : 'drift',
    entries: contract.entries.map((entry) => ({
      id: entry.id,
      required: entry.required,
      ok: !failures.includes(entry.id),
    })),
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  if (failures.length > 0) {
    console.log(`drift status=drift failed=${failures.join(',')} fixture=${fixturePath}`);
    process.exitCode = 2;
  } else {
    console.log(`drift status=ok failed=0 fixture=${fixturePath}`);
    process.exitCode = 0;
  }
} else {
  const contract = JSON.parse(readFileSync('src/adapters/x/selectors.json', 'utf8'));
  const timestamp = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let loaded = false;

  try {
    for (let attempt = 0; attempt < 2 && !loaded; attempt += 1) {
      try {
        await page.goto(target, { timeout: 30_000, waitUntil: 'domcontentloaded' });
        loaded = true;
      } catch {
        if (attempt === 1) {
          const report = {
            contractVersion: contract.contractVersion,
            target,
            timestamp,
            status: 'unreachable',
            entries: [],
          };
          writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
          console.log(`drift status=unreachable target=${target}`);
          process.exitCode = 3;
        }
      }
    }

    if (loaded) {
      const entries = await page.evaluate(
        (contractEntries) =>
          contractEntries.map((entry) => {
            let matchedSelector = null;
            for (const selector of entry.selectors) {
              try {
                if (document.querySelector(selector)) {
                  matchedSelector = selector;
                  break;
                }
              } catch {
                // Invalid selectors are treated as non-matches.
              }
            }
            return {
              id: entry.id,
              required: entry.required,
              matchedSelector,
              ok: matchedSelector !== null,
            };
          }),
        contract.entries,
      );
      const failures = entries
        .filter((entry) => entry.required && !entry.ok)
        .map((entry) => entry.id);
      const status = failures.length === 0 ? 'ok' : 'drift';
      const report = {
        contractVersion: contract.contractVersion,
        target,
        timestamp,
        status,
        entries,
      };
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

      if (failures.length > 0) {
        writeFileSync(
          resolve(dirname(reportPath), 'drift-dom.html'),
          (await page.locator('html').evaluate((element) => element.outerHTML)).slice(0, 200_000),
        );
        console.log(`drift status=drift failed=${failures.join(',')} target=${target}`);
        process.exitCode = 2;
      } else {
        console.log(`drift status=ok failed=0 target=${target}`);
        process.exitCode = 0;
      }
    }
  } finally {
    await browser.close();
  }
}
