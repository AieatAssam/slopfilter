import { mkdir, rm } from 'node:fs/promises';
import type { BrowserContext, Worker } from '@playwright/test';
import { test as base, expect as baseExpect, chromium } from '@playwright/test';

type Fixtures = {
  context: BrowserContext;
  extensionId: string;
};

export const test = base.extend<Fixtures>({
  context: async ({ browserName: _browserName }, use, testInfo) => {
    const userDataDir = `${testInfo.outputDir}/user-data-${testInfo.workerIndex}`;
    await mkdir(userDataDir, { recursive: true });
    const distPath = new URL('../../dist/', import.meta.url).pathname.replace(/\/$/, '');
    const context = await chromium.launchPersistentContext(userDataDir, {
      args: [
        `--disable-extensions-except=${distPath}`,
        `--load-extension=${distPath}`,
        '--no-first-run',
      ],
      headless: false,
    });

    try {
      await use(context);
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  },
  extensionId: async ({ context }, use) => {
    let serviceWorker: Worker | undefined = context.serviceWorkers()[0];
    try {
      serviceWorker = context.serviceWorkers()[0];
      if (!serviceWorker) {
        serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
      }
    } catch {
      throw new Error('extension did not load: no service worker');
    }

    const extensionId = new URL(serviceWorker.url()).hostname;
    if (!extensionId) throw new Error('extension did not load: no service worker');
    await use(extensionId);
  },
});

export const expect = baseExpect;
