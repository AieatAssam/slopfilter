import type { BrowserContext } from '@playwright/test';
import { expect, test } from '../support/extension';
import { layoutVariantIds, mountGolden, setAccent, setTheme } from '../support/harness';

const openGolden = async (context: BrowserContext) => {
  const page = await context.newPage();
  await page.goto('/');
  await mountGolden(page);
  return page;
};

test('golden route mounts the fixture articles with original class names', async ({ context }) => {
  const page = await openGolden(context);

  const articles = page.locator('article[data-testid="tweet"]');
  expect(await articles.count()).toBeGreaterThanOrEqual(9);
  for (let index = 0; index < 8; index += 1) {
    const classList = await articles.nth(index).getAttribute('class');
    expect(classList).toContain('r-');
  }
});

test('layoutVariantIds returns articles with pairwise different offsetHeight', async ({
  context,
}) => {
  const page = await openGolden(context);

  const ids = await layoutVariantIds(page);
  expect(ids.length).toBeGreaterThanOrEqual(3);
  const heights = await page.evaluate((result) => {
    return result.map((id) => {
      const element = document.getElementById(id);
      return element instanceof HTMLElement ? element.offsetHeight : -1;
    });
  }, ids);
  expect(new Set(heights).size).toBe(heights.length);
});

test('each theme name sets the declared body background color', async ({ context }) => {
  const page = await openGolden(context);

  const expectations: Record<string, string> = {
    default: 'rgb(255, 255, 255)',
    dim: 'rgb(21, 32, 43)',
    'lights-out': 'rgb(0, 0, 0)',
  };
  for (const [theme, expected] of Object.entries(expectations)) {
    await setTheme(page, theme as 'default' | 'dim' | 'lights-out');
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe(expected);
  }
});

test('setAccent is readable as the accent probe computed background color', async ({ context }) => {
  const page = await openGolden(context);

  await setAccent(page, 'rgb(120, 86, 255)');
  const background = await page
    .locator('[data-testid="tweetButtonInline"]')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe('rgb(120, 86, 255)');
});

test('mountGolden is idempotent and keeps class attributes', async ({ context }) => {
  const page = await openGolden(context);
  await mountGolden(page);

  const articles = page.locator('article[data-testid="tweet"]');
  expect(await articles.count()).toBeGreaterThanOrEqual(9);
  const classList = await articles.first().getAttribute('class');
  expect(classList).toContain('r-');
});
