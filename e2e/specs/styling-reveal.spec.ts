import type { BrowserContext } from '@playwright/test';
import { expect, test } from '../support/extension';
import { attachFeedback, goldenVariantIds, mountGolden, restoreArticle } from '../support/harness';

const openGolden = async (context: BrowserContext) => {
  const page = await context.newPage();
  await page.goto('/');
  await mountGolden(page);
  const ids = await goldenVariantIds(page);
  for (const id of ids) await restoreArticle(page, id);
  for (const id of ids) await attachFeedback(page, id);
  return { page, ids };
};

test('at rest the cluster is visible without hovering its article', async ({ context }) => {
  const { page, ids } = await openGolden(context);
  const article = page.locator(`[id="${ids[0]}"]`);
  const cluster = article.locator('[data-testid="slopfilter-feedback"]');

  await expect(cluster).toHaveCSS('opacity', '1');
  await expect(cluster).toHaveCount(1);

  await article.hover();
  await expect(cluster).toHaveCSS('opacity', '1');
});

test('tabbing to the first control reveals the cluster with no pointer interaction', async ({
  context,
}) => {
  const { page, ids } = await openGolden(context);
  const article = page.locator(`[id="${ids[0]}"]`);
  const cluster = article.locator('[data-testid="slopfilter-feedback"]');
  const firstControl = cluster.getByRole('button').first();

  await page.keyboard.press('Tab');
  for (
    let step = 0;
    step < 60 && !(await cluster.evaluate((element) => element.contains(document.activeElement)));
    step += 1
  ) {
    await page.keyboard.press('Tab');
  }

  expect(await cluster.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(cluster).toHaveCSS('opacity', '1');
  await expect(firstControl).toBeFocused();
});

test('every control keeps a non-empty accessible name and is keyboard reachable', async ({
  context,
}) => {
  const { page, ids } = await openGolden(context);
  const article = page.locator(`[id="${ids[0]}"]`);
  const cluster = article.locator('[data-testid="slopfilter-feedback"]');
  const controls = cluster.getByRole('button');
  const count = await controls.count();
  expect(count).toBeGreaterThanOrEqual(2);

  const names = await controls.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label') || button.textContent || ''),
  );
  for (const name of names) expect(name.trim()).not.toBe('');

  await page.keyboard.press('Tab');
  for (
    let step = 0;
    step < 60 && !(await cluster.evaluate((element) => element.contains(document.activeElement)));
    step += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(cluster.getByRole('button')).toHaveCount(count);

  const seen = new Set<number>();
  for (let step = 0; step < 20; step += 1) {
    const activeIndex = await cluster.evaluate((element) => {
      const buttons = Array.from(element.querySelectorAll<HTMLElement>('button'));
      const active = document.activeElement;
      return active instanceof HTMLElement && active.closest('[data-testid="slopfilter-feedback"]')
        ? buttons.indexOf(active)
        : -1;
    });
    if (activeIndex >= 0) seen.add(activeIndex);
    await page.keyboard.press('Tab');
  }
  expect(seen.size).toBeGreaterThanOrEqual(2);
});

test('the cluster stays revealed while the account menu is open, even after pointer leaves', async ({
  context,
}) => {
  const { page, ids } = await openGolden(context);
  const article = page.locator(`[id="${ids[0]}"]`);
  const cluster = article.locator('[data-testid="slopfilter-feedback"]');

  await article.hover();
  await cluster.getByRole('button', { name: 'Account options' }).click();
  await expect(cluster).toHaveCSS('opacity', '1');

  await page.mouse.move(10, 10);
  await expect(cluster).toHaveCSS('opacity', '1');
});
