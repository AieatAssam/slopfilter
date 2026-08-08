import { expect, test } from '../support/extension';

test('the onboarding page explains the product and links to privacy', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/ui/onboarding/onboarding.html`);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('SlopFilter');
  await expect(page.getByText('What this never does')).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(
    /\b(ai[- ]?(generated|written|detect)|written by (an )?ai|authored by)\b/i,
  );

  await page.getByRole('link', { name: 'Read the privacy details' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('SlopFilter privacy');
  await expect(page.locator('body')).toContainText('no accounts');
  await expect(page.locator('body')).toContainText('DevTools');
  await page.close();
});

test('the onboarding page remains directly reachable', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/ui/onboarding/onboarding.html`);
  await expect(page.getByRole('link', { name: 'Adjust settings' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('SlopFilter');
  await page.close();
});
