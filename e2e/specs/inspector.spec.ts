import { expect, test } from '../support/extension';
import { resetHarness, waitForScoringSettled } from '../support/harness';

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http://localhost:5174')) await resetHarness(page);
});

test('a visible post opens the inspector with one row per configured layer', async ({ page }) => {
  await page.goto('/');
  const post = page.locator('article[data-testid="tweet"]').first();
  await expect(post.getByRole('button', { name: 'Why this score' })).toBeVisible();
  await post.hover();

  await post.getByRole('button', { name: 'Why this score' }).click();

  const inspector = page.getByTestId('slopfilter-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveAttribute('aria-label', 'Score details for this post');
  const rows = inspector.locator('[data-testid="slopfilter-inspector-row"]');
  await expect(rows).toHaveCount(7);
  const statuses = await rows.evaluateAll((all) =>
    all.map((row) => row.getAttribute('data-status')),
  );
  for (const status of statuses) {
    expect(['scored', 'gated', 'below-cutoff', 'unavailable', 'no-data', 'disabled']).toContain(
      status,
    );
  }
  await expect(inspector).not.toContainText(/\b(ai|generated|synthetic|authored)\b/i);
});

test('a collapsed post opens the inspector whose totals match the placeholder reason', async ({
  page,
}) => {
  await page.goto('/?fixture=high-frequency');
  await waitForScoringSettled(page);
  const placeholder = page.getByTestId('slopfilter-placeholder').first();
  await expect(placeholder).toBeVisible();
  const reason = await placeholder.locator('.slopfilter-reason').textContent();
  await placeholder.hover();

  await placeholder.getByRole('button', { name: 'Why this score' }).click();

  const inspector = page.getByTestId('slopfilter-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByTestId('slopfilter-inspector-totals')).toContainText('threshold');
  if (reason) await expect(inspector).toContainText(reason.replace(/^Hidden:\s*/, ''));
});

test('the inspector closes on Escape and returns focus to its trigger', async ({ page }) => {
  await page.goto('/');
  const post = page.locator('article[data-testid="tweet"]').first();
  const trigger = post.getByRole('button', { name: 'Why this score' });
  await expect(trigger).toBeVisible();
  await trigger.focus();

  await page.keyboard.press('Enter');
  const inspector = page.getByTestId('slopfilter-inspector');
  await expect(inspector).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(inspector).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Why this score');
});
