import { expect, test } from '../support/extension';
import { resetHarness } from '../support/harness';

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

test('changing the hide threshold changes which posts are collapsed', async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto('/?fixture=high-frequency');
  const placeholders = page.getByTestId('slopfilter-placeholder');
  expect(await placeholders.count()).toBeGreaterThan(0);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  const threshold = options.getByLabel('Hide threshold');
  await threshold.press('End');
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');

  await page.goto('/?fixture=high-frequency');
  await expect(page.locator('article[data-testid="tweet"]')).toHaveCount(10);
  expect(await page.getByTestId('slopfilter-placeholder').count()).toBe(0);
  await options.close();
});

test('clamps an out-of-range stored threshold', async ({ page, context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  await options.evaluate(() => chrome.storage.local.set({ hideThreshold: 2 }));
  await options.reload();

  await expect(options.getByLabel('Hide threshold')).toHaveValue('1');
  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await options.close();
});
