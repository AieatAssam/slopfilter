import { expect, test } from '../support/extension';
import { resetHarness, waitForScoringSettled } from '../support/harness';

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

test('changing the hide threshold changes which posts are collapsed', async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto('/?fixture=high-frequency');
  await waitForScoringSettled(page);
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

test('resets an individual layer setting to its documented default', async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  const weight = options.getByLabel('Weight Posting behaviour');
  await weight.fill('0.9');
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');

  await options.getByRole('button', { name: 'Reset weight' }).first().click();
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');
  await expect(weight).toHaveValue('0.6');
  await options.close();
});

test('advertisement hiding is on by default and can be switched off', async ({
  page,
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  const hideAds = options.getByLabel('Hide advertisements');
  await expect(hideAds).toBeChecked();
  await hideAds.uncheck();
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');

  await page.goto('/?fixture=advertisement');
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
  await expect(page.locator('article[data-testid="tweet"]')).toBeVisible();
  await options.close();
});

test('info tip expands a help bubble on click and closes on Escape', async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);

  const tip = options.getByRole('button', { name: 'A higher value means fewer posts are hidden.' });
  const bubble = options.getByRole('note', {
    name: 'A higher value means fewer posts are hidden.',
  });

  await tip.click();
  await expect(tip).toHaveAttribute('aria-expanded', 'true');
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText('A higher value means fewer posts are hidden.');

  await tip.press('Escape');
  await expect(tip).toHaveAttribute('aria-expanded', 'false');
  await options.close();
});

test('only one info tip bubble is open at a time', async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);

  const behavioural = options.getByRole('button', {
    name: 'Looks at posting pace and engagement balance visible in your timeline.',
  });
  const taste = options.getByRole('button', {
    name: 'Learns from posts you mark Not interested, using only local history.',
  });

  await behavioural.click();
  await expect(behavioural).toHaveAttribute('aria-expanded', 'true');
  await taste.click();
  await expect(behavioural).toHaveAttribute('aria-expanded', 'false');
  await expect(taste).toHaveAttribute('aria-expanded', 'true');
  await options.close();
});
