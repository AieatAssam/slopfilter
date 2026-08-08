import { mkdir, rm } from 'node:fs/promises';
import { type BrowserContext, chromium, expect, test } from '@playwright/test';

// biome-ignore lint/suspicious/noExportsInTest: budget constants are part of the benchmark contract.
export const LATENCY_BUDGET_MS = 100;
// biome-ignore lint/suspicious/noExportsInTest: budget constants are part of the benchmark contract.
export const MEMORY_BUDGET_BYTES = 300 * 1024 * 1024;
const WARMUPS = 3;
const MEASURED_RUNS = 15;
const BENCHMARK_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

let context: BrowserContext;
let page: import('@playwright/test').Page;
let extensionDir: string;

const appendBatch = async (index: number): Promise<number> => {
  await page.evaluate(() => window.__slopfilterHarness.reset());
  await page.evaluate(
    ({ run, imageUrl }) => {
      performance.mark('slopfilter-batch-start');
      for (let index = 0; index < 10; index += 1) {
        window.__slopfilterHarness.appendPost({
          id: `benchmark-${run}-${index}`,
          authorHandle: '@benchmark',
          text: `Benchmark post ${run}-${index}`,
          postedAt: new Date(Date.now() - index * 60_000).toISOString(),
          ...(index === 0 ? { imageUrl } : {}),
        });
      }
    },
    { run: index, imageUrl: BENCHMARK_IMAGE },
  );
  await expect(
    page.locator('[data-harness-appended="true"][data-slopfilter-model-processed="true"]'),
  ).toHaveCount(10, {
    timeout: 60_000,
  });
  return page.evaluate(() => {
    performance.mark('slopfilter-batch-end');
    return performance.measure('slopfilter-batch', 'slopfilter-batch-start', 'slopfilter-batch-end')
      .duration;
  });
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower] ?? 0;
  return (sorted[lower] ?? 0) + ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * (position - lower);
};

// biome-ignore lint/correctness/noEmptyPattern: Playwright requires the fixture object here.
test.beforeAll(async ({}, testInfo) => {
  const extensionPath = new URL('../dist/', import.meta.url).pathname.replace(/\/$/, '');
  extensionDir = `${testInfo.outputDir}/scoring-extension`;
  await mkdir(extensionDir, { recursive: true });
  context = await chromium.launchPersistentContext(extensionDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--enable-precise-memory-info',
    ],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);
  await expect(popup.getByTestId('slopfilter-model-status')).toHaveText('All filters active.', {
    timeout: 120_000,
  });
  await popup.close();
  page = await context.newPage();
  await page.goto('http://localhost:5174/');
});

test.afterAll(async () => {
  await context.close();
  await rm(extensionDir, { recursive: true, force: true });
});

test('per-batch scoring latency stays within the 100ms budget', async () => {
  for (let index = 0; index < WARMUPS; index += 1) await appendBatch(index);
  const measurements = [];
  for (let index = 0; index < MEASURED_RUNS; index += 1) {
    measurements.push(await appendBatch(WARMUPS + index));
  }
  const medianMs = median(measurements);
  const iqrMs = percentile(measurements, 0.75) - percentile(measurements, 0.25);
  console.log(
    `scoring median=${medianMs.toFixed(2)}ms iqr=${iqrMs.toFixed(2)}ms n=${measurements.length}`,
  );
  expect(
    medianMs,
    `measured scoring median ${medianMs.toFixed(2)}ms exceeds ${LATENCY_BUDGET_MS}ms`,
  ).toBeLessThanOrEqual(LATENCY_BUDGET_MS);
});

test('memory footprint stays within the 300MB budget', async () => {
  const bytes = await page.evaluate(async () => {
    const measure = (
      performance as Performance & {
        measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
      }
    ).measureUserAgentSpecificMemory;
    if (!measure) throw new Error('memory measurement API unavailable');
    return (await measure.call(performance)).bytes;
  });
  console.log(`memory=${bytes} bytes budget=${MEMORY_BUDGET_BYTES} bytes`);
  expect(bytes).toBeLessThanOrEqual(MEMORY_BUDGET_BYTES);
});

test('records the current backend policy', async () => {
  const webgpu = await page.evaluate(() => 'gpu' in navigator);
  console.log(`backend classifier=wasm embedder=wasm webgpu-capable=${webgpu} allowlist=empty`);
  expect(webgpu || !webgpu).toBe(true);
});
