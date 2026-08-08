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

export const mountGolden = async (page: Page) => {
  await page.evaluate(() => window.__slopfilterHarness.mountGolden());
};

export const layoutVariantIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__slopfilterHarness.layoutVariantIds());

export const goldenVariantIds = layoutVariantIds;

export const attachFeedback = (page: Page, articleId: string): Promise<void> =>
  page.evaluate((value) => window.__slopfilterHarness.attachFeedback(value), articleId);

export const restoreArticle = (page: Page, articleId: string): Promise<void> =>
  page.evaluate((value) => window.__slopfilterHarness.restoreArticle(value), articleId);

export type HarnessTheme = 'default' | 'dim' | 'lights-out';

export const setTheme = (page: Page, theme: HarnessTheme) =>
  page.evaluate((value) => window.__slopfilterHarness.setTheme(value), theme);

export const setAccent = (page: Page, color: string) =>
  page.evaluate((value) => window.__slopfilterHarness.setAccent(value), color);
