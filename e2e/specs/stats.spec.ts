import { expect, test } from '../support/extension';
import { resetHarness, waitForScoringSettled } from '../support/harness';

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http://localhost:5174')) await resetHarness(page);
});

test('the popup reports non-zero counts after filtering and clears them', async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto('/?fixture=high-frequency');
  await waitForScoringSettled(page);
  await expect(page.getByTestId('slopfilter-placeholder').first()).toBeVisible();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts seen: 10');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText(/Posts hidden: [1-9]/);

  await popup.getByRole('button', { name: 'Clear statistics' }).click();
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts seen: 0');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts hidden: 0');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('not enough data yet');
  await popup.close();
});

test('a fresh profile suppresses the wrong-call rate', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);

  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts seen: 0');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts hidden: 0');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('not enough data yet');
  await popup.close();
});
