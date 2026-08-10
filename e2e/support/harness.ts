import type { Page, TestInfo } from '@playwright/test';

export type HarnessPost = {
  id: string;
  authorHandle: string;
  text: string;
  postedAt: string;
  imageUrl?: string;
  engagement?: {
    likes?: string;
    reposts?: string;
    replies?: string;
    views?: string;
  };
};

export const uniqueRunId = (testInfo: TestInfo) =>
  `${testInfo.workerIndex}-${testInfo.testId}-${Date.now()}`;

// Scoring is two-phase: pass 1 collapses from behavioural signals alone, pass 2 re-scores after the
// activity cache and model resolve and may collapse additional posts. A test that starts clicking
// before both passes land can race a collapse. The content script fires slopfilter-batch-scored only
// after pass 2 has rendered every decision (collapses included), so the DOM is final once every tweet
// carries data-slopfilter-model-processed.
export const waitForScoringSettled = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const check = () => {
          const articles = Array.from(
            document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
          );
          if (articles.length === 0) {
            resolve();
            return true;
          }
          const done = articles.every(
            (element) =>
              element.dataset.slopfilterProcessed === 'true' &&
              element.dataset.slopfilterModelProcessed === 'true',
          );
          if (done) resolve();
          return done;
        };
        if (!check()) window.addEventListener('slopfilter-batch-scored', check);
      }),
  );

// SF-216: issue the page's own HomeTimeline request against the harness stub. The MAIN-world
// interceptor observes it, so the relay reaches the content script without the test touching
// extension internals.
export const fetchHomeTimeline = (page: Page): Promise<void> =>
  page.evaluate(() =>
    window.fetch('/api/graphql/unused-query-id/HomeTimeline').then(() => undefined),
  );

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
