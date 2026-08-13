import { expect, test } from '../support/extension';

test('popup presents model state and weekly stats as separate readable cards', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);

  await expect(page.locator('body')).toHaveClass(/sf-popup/);
  await expect(page.getByRole('heading', { name: 'SlopFilter' })).toBeVisible();
  await expect(page.getByTestId('slopfilter-models')).toHaveCSS('border-radius', '14px');
  await expect(page.getByTestId('slopfilter-stats')).toHaveCSS('border-radius', '14px');
  await expect(page.getByRole('button', { name: 'Clear statistics' })).toHaveCSS(
    'min-height',
    '36px',
  );
  await page.close();
});

test('onboarding and privacy pages share the readable extension layout', async ({
  context,
  extensionId,
}) => {
  const onboarding = await context.newPage();
  await onboarding.goto(`chrome-extension://${extensionId}/ui/onboarding/onboarding.html`);
  await expect(onboarding.locator('body')).toHaveClass(/sf-page/);
  await expect(onboarding.locator('.sf-page-card')).toHaveCount(2);
  await expect(onboarding.locator('.sf-page-card').first()).toHaveCSS('border-radius', '16px');

  await onboarding.getByRole('link', { name: 'Read the privacy details' }).click();
  await expect(onboarding).toHaveURL(/privacy\.html$/);
  await expect(onboarding.locator('.sf-page-card')).toHaveCount(2);
  await expect(onboarding.getByRole('heading', { name: 'Verify it yourself' })).toBeVisible();
  await onboarding.close();
});

test('settings keeps the primary threshold and signal controls visually grouped', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/ui/options/options.html`);

  await expect(page.locator('.settings-header h1')).toHaveText('SlopFilter');
  await expect(page.locator('.setting-card-featured')).toHaveCSS('border-radius', '16px');
  await expect(page.locator('.layers-card')).toHaveCSS('border-radius', '16px');
  await expect(page.getByLabel('Hide threshold')).toBeVisible();
  await expect(page.getByLabel('Use Optional text pattern signal')).toBeVisible();
  await page.close();
});
