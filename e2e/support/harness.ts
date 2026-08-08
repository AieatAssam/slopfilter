import type { Page, TestInfo } from '@playwright/test';

export type HarnessPost = {
  id: string;
  authorHandle: string;
  text: string;
  postedAt: string;
  imageUrl?: string;
};

export const uniqueRunId = (testInfo: TestInfo) =>
  `${testInfo.workerIndex}-${testInfo.testId}-${Date.now()}`;

export const appendPost = async (page: Page, post: HarnessPost) => {
  await page.evaluate((value) => window.__slopfilterHarness.appendPost(value), post);
};

export const resetHarness = async (page: Page) => {
  await page.evaluate(() => window.__slopfilterHarness?.reset());
};
