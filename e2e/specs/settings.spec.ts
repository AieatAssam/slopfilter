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

test('the repetition toggle and weight round-trip like the other layers', async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);

  const weight = options.getByLabel('Weight Repeated text');
  const use = options.getByLabel('Use Repeated text signal');
  const repetition = options.locator('.layer-row').filter({ hasText: 'Repeated text' });
  await expect(use).toBeChecked();
  await expect(weight).toHaveValue('0.3');

  await weight.fill('0.45');
  await use.uncheck();
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');

  await options.reload();
  await expect(options.getByLabel('Weight Repeated text')).toHaveValue('0.45');
  await expect(options.getByLabel('Use Repeated text signal')).not.toBeChecked();

  await repetition.getByRole('button', { name: 'Reset weight' }).click();
  await repetition.getByRole('button', { name: 'Reset use' }).click();
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');
  await expect(options.getByLabel('Weight Repeated text')).toHaveValue('0.3');
  await expect(options.getByLabel('Use Repeated text signal')).toBeChecked();
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

test('cohort settings persist a custom cutoff and volume endpoints across reload', async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);

  const cutoff = options.getByLabel('Cutoff date');
  const floor = options.getByLabel('Floor');
  const ceiling = options.getByLabel('Ceiling');

  await cutoff.fill('2020-05-01');
  await floor.fill('25');
  await ceiling.fill('120');
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');

  await options.reload();

  await expect(cutoff).toHaveValue('2020-05-01');
  await expect(floor).toHaveValue('25');
  await expect(ceiling).toHaveValue('120');
  await options.close();
});

test('cohort resets restore the documented defaults', async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);

  await options.getByLabel('Cutoff date').fill('2018-08-08');
  await options.getByLabel('Floor').fill('7');
  await options.getByLabel('Ceiling').fill('60');
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');

  await options.getByRole('button', { name: 'Reset cutoff' }).click();
  await options.getByRole('button', { name: 'Reset floor' }).click();
  await options.getByRole('button', { name: 'Reset ceiling' }).click();
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');

  await expect(options.getByLabel('Cutoff date')).toHaveValue('2022-11-30');
  await expect(options.getByLabel('Floor')).toHaveValue('20');
  await expect(options.getByLabel('Ceiling')).toHaveValue('100');
  await options.close();
});

test('raises a stored cohort ceiling that sits below its floor', async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  await options.evaluate(() =>
    chrome.storage.local.set({ cohortVolumeFloor: 30, cohortVolumeCeiling: 10 }),
  );
  await options.reload();

  await expect(options.getByLabel('Floor')).toHaveValue('30');
  await expect(options.getByLabel('Ceiling')).toHaveValue('30');
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
