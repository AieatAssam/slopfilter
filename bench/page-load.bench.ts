import { mkdir, rm } from 'node:fs/promises';
import { type BrowserContext, chromium, expect, test } from '@playwright/test';

// PRD section 5 budget: extension page-load delta must stay at or below 50ms.
// The harness serves captured golden markup rather than a live X feed.
const BUDGET_MS = 50;
const WARMUPS = 3;
const MEASURED_RUNS = 15;

const valueAt = (values: readonly number[], index: number): number => {
  const value = values[index];
  if (value === undefined) throw new Error('benchmark requires at least one measurement');
  return value;
};

const measure = async (context: BrowserContext): Promise<number> => {
  const page = await context.newPage();
  try {
    await page.goto('/');
    return await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      return navigation?.duration ?? 0;
    });
  } finally {
    await page.close();
  }
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (valueAt(sorted, middle - 1) + valueAt(sorted, middle)) / 2
    : valueAt(sorted, middle);
};

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return valueAt(sorted, lower);
  return (
    valueAt(sorted, lower) + (valueAt(sorted, upper) - valueAt(sorted, lower)) * (position - lower)
  );
};

const iqr = (values: readonly number[]): number =>
  percentile(values, 0.75) - percentile(values, 0.25);

test('extension page-load delta stays within the 50ms budget', async ({
  browserName: _browserName,
}, testInfo) => {
  const extensionPath = new URL('../dist/', import.meta.url).pathname.replace(/\/$/, '');
  const extensionDir = `${testInfo.outputDir}/page-load-extension`;
  const baselineDir = `${testInfo.outputDir}/page-load-baseline`;
  await mkdir(extensionDir, { recursive: true });
  await mkdir(baselineDir, { recursive: true });

  const extensionContext = await chromium.launchPersistentContext(extensionDir, {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const baselineContext = await chromium.launchPersistentContext(baselineDir, {
    headless: false,
  });

  try {
    for (let i = 0; i < WARMUPS; i += 1) {
      await measure(extensionContext);
      await measure(baselineContext);
    }
    const extension = [];
    const baseline = [];
    for (let i = 0; i < MEASURED_RUNS; i += 1) {
      extension.push(await measure(extensionContext));
      baseline.push(await measure(baselineContext));
    }

    const extensionMedian = median(extension);
    const baselineMedian = median(baseline);
    const delta = extensionMedian - baselineMedian;
    console.log(
      `extension median=${extensionMedian.toFixed(2)}ms iqr=${iqr(extension).toFixed(2)}ms n=${extension.length}`,
    );
    console.log(
      `baseline median=${baselineMedian.toFixed(2)}ms iqr=${iqr(baseline).toFixed(2)}ms n=${baseline.length}`,
    );
    console.log(`delta=${delta.toFixed(2)}ms budget=${BUDGET_MS}ms`);
    expect(
      delta,
      `measured page-load delta ${delta.toFixed(2)}ms exceeds ${BUDGET_MS}ms`,
    ).toBeLessThanOrEqual(BUDGET_MS);
  } finally {
    await extensionContext.close();
    await baselineContext.close();
    await rm(extensionDir, { recursive: true, force: true });
    await rm(baselineDir, { recursive: true, force: true });
  }
});
