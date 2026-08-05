import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const target = targetIndex >= 0 ? args[targetIndex + 1] : undefined;
const outIndex = args.indexOf('--out');
const reportPath = resolve(
  outIndex >= 0 ? (args[outIndex + 1] ?? 'drift-report.json') : 'drift-report.json',
);
if (!target) {
  console.error('usage: node scripts/check-drift.mjs --target <url> [--out <path>]');
  process.exitCode = 1;
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
