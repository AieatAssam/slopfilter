import { expect, test } from '../support/extension';
import { type HarnessTheme, mountGolden, setAccent, setTheme } from '../support/harness';

const injectSample = async (page: import('@playwright/test').Page, theme: HarnessTheme) => {
  await page.evaluate(() => {
    const menu = document.createElement('div');
    menu.className = 'slopfilter-account-menu';
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = 'Mute this account';
    menu.appendChild(item);
    document.body.appendChild(menu);
  });
  await setTheme(page, theme);
};

test('injected UI tracks each of Xs three themes on computed colors', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('/');
  await mountGolden(page);

  const box: Record<HarnessTheme, { background: string }> = {
    default: { background: 'rgb(255, 255, 255)' },
    dim: { background: 'rgb(21, 32, 43)' },
    'lights-out': { background: 'rgb(0, 0, 0)' },
  };
  const text: Record<HarnessTheme, string> = {
    default: 'rgb(15, 20, 25)',
    dim: 'rgb(247, 249, 249)',
    'lights-out': 'rgb(231, 233, 234)',
  };
  for (const theme of ['default', 'dim', 'lights-out'] as HarnessTheme[]) {
    await injectSample(page, theme);
    const menu = page.locator('.slopfilter-account-menu').last();
    await expect(menu).toHaveCSS('background-color', box[theme].background);
    await expect(menu.locator('button')).toHaveCSS('color', text[theme]);
  }
});

test('a non-default accent becomes the Show anyway computed background', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('/');
  await mountGolden(page);

  await page.evaluate(() => {
    const element = document.createElement('button');
    element.className = 'slopfilter-show-anyway';
    element.type = 'button';
    element.textContent = 'Show anyway';
    document.body.appendChild(element);
  });
  await setAccent(page, 'rgb(120, 86, 255)');
  await setTheme(page, 'default');

  const background = await page
    .locator('.slopfilter-show-anyway')
    .last()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe('rgb(120, 86, 255)');
});

test('a theme change after injection restyles already-injected UI without a reload', async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto('/');
  await mountGolden(page);

  await injectSample(page, 'default');
  await expect(page.locator('.slopfilter-account-menu').last()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );

  await setTheme(page, 'lights-out');
  await expect(page.locator('.slopfilter-account-menu').last()).toHaveCSS(
    'background-color',
    'rgb(0, 0, 0)',
  );
});
