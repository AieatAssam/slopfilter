import type { BrowserContext } from '@playwright/test';
import { expect, test } from '../support/extension';
import { attachFeedback, goldenVariantIds, mountGolden, restoreArticle } from '../support/harness';

const restoreVariants = async (
  page: import('@playwright/test').Page,
  ids: string[],
): Promise<void> => {
  for (const id of ids) await restoreArticle(page, id);
};

const openGolden = async (context: BrowserContext) => {
  const page = await context.newPage();
  await page.goto('/');
  await mountGolden(page);
  return page;
};

test('the cluster offset from each articles top-right corner is identical within 2px', async ({
  context,
}) => {
  const page = await openGolden(context);
  const ids = await goldenVariantIds(page);
  await restoreVariants(page, ids);
  for (const id of ids) await attachFeedback(page, id);

  const joins = await page.evaluate((targets) => {
    return targets.map((id) => {
      const article = document.getElementById(id);
      if (!(article instanceof HTMLElement)) throw new Error(`article missing: ${id}`);
      const cluster = article.querySelector('[data-testid="slopfilter-feedback"]');
      if (!(cluster instanceof HTMLElement)) throw new Error(`cluster missing: ${id}`);
      const articleRect = article.getBoundingClientRect();
      const clusterRect = cluster.getBoundingClientRect();
      const top = clusterRect.top - articleRect.top;
      const right = articleRect.right - clusterRect.right;
      const contained =
        clusterRect.top >= articleRect.top &&
        clusterRect.left >= articleRect.left &&
        clusterRect.bottom <= articleRect.bottom &&
        clusterRect.right <= articleRect.right;
      return { top, right, contained };
    });
  }, ids);

  const reference = joins[0];
  if (!reference) throw new Error('no first join');
  for (const join of joins.slice(1)) {
    expect(Math.abs(join.top - reference.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(join.right - reference.right)).toBeLessThanOrEqual(2);
  }
});

test('each cluster box is fully contained by its own article box', async ({ context }) => {
  const page = await openGolden(context);
  const ids = await goldenVariantIds(page);
  await restoreVariants(page, ids);
  for (const id of ids) await attachFeedback(page, id);

  const groups = await page.evaluate((targets) => {
    return targets.map((id) => {
      const article = document.getElementById(id);
      if (!(article instanceof HTMLElement)) throw new Error(`article missing: ${id}`);
      const cluster = article.querySelector('[data-testid="slopfilter-feedback"]');
      if (!(cluster instanceof HTMLElement)) throw new Error(`cluster missing: ${id}`);
      const articleRect = article.getBoundingClientRect();
      const clusterRect = cluster.getBoundingClientRect();
      return {
        contained:
          clusterRect.top >= articleRect.top &&
          clusterRect.left >= articleRect.left &&
          clusterRect.bottom <= articleRect.bottom &&
          clusterRect.right <= articleRect.right,
      };
    });
  }, ids);

  for (const group of groups) expect(group.contained).toBe(true);
});

test('injection leaves each article offsetHeight unchanged', async ({ context }) => {
  const page = await openGolden(context);
  const ids = await goldenVariantIds(page);
  await restoreVariants(page, ids);

  const before = await page.evaluate((targets) => {
    return targets.map((id) => document.getElementById(id)?.offsetHeight ?? -1);
  }, ids);
  for (const id of ids) await attachFeedback(page, id);
  const after = await page.evaluate((targets) => {
    return targets.map((id) => document.getElementById(id)?.offsetHeight ?? -1);
  }, ids);

  expect(after).toEqual(before);
});
