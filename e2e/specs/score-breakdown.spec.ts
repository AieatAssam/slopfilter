import { expect, test } from '../support/extension';

test('shows the behavioural layer in the collapsed-post breakdown', async ({ page }) => {
  await page.goto('/?fixture=high-frequency');
  await expect(page.getByTestId('slopfilter-placeholder').first()).toBeVisible();

  const panel = page.getByTestId('slopfilter-breakdown-panel');
  const toggle = page.getByRole('button', { name: 'Why was this hidden?' }).first();
  await expect(toggle).toHaveClass(/slopfilter-breakdown-toggle/);
  await expect(toggle).toHaveCSS('border-radius', '999px');
  await expect(panel).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.click();

  await expect(panel).toBeVisible();
  await expect(panel).toHaveClass(/slopfilter-breakdown-panel/);
  await expect(panel).toHaveCSS('border-radius', '12px');
  await expect(panel).toContainText('behavioural');
  await expect(panel).not.toContainText(/\b(ai|generated|synthetic|authored)\b/i);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('collapses the breakdown again on a second activation', async ({ page }) => {
  await page.goto('/?fixture=high-frequency');
  const toggle = page.getByRole('button', { name: 'Why was this hidden?' }).first();
  await expect(toggle).toBeVisible();

  await toggle.click();
  await expect(page.getByTestId('slopfilter-breakdown-panel')).toBeVisible();
  await toggle.click();

  await expect(page.getByTestId('slopfilter-breakdown-panel')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
