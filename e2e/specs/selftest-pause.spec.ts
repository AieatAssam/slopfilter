import type { Page } from '@playwright/test';
import { expect, test } from '../support/extension';
import { resetHarness } from '../support/harness';

const openPopup = async (page: Page, extensionId: string) => {
  const popup = await page.context().newPage();
  await popup.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);
  return popup;
};

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

test('a healthy timeline reports filtering on', async ({ page, extensionId }) => {
  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();

  const popup = await openPopup(page, extensionId);
  const status = popup.getByTestId('slopfilter-popup-status');
  await expect(status).toContainText('Filtering is on.');
  await expect(status).not.toContainText('paused');
});

test('pauses filtering and hides nothing when a required selector is missing', async ({
  page,
  extensionId,
}) => {
  await page.goto('/?fixture=broken');
  await expect(page.getByTestId('tweet')).toHaveCount(3);

  const popup = await openPopup(page, extensionId);
  const status = popup.getByTestId('slopfilter-popup-status');
  await expect(status).toContainText('paused');
  await expect(status).toContainText('unfiltered');
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
});
