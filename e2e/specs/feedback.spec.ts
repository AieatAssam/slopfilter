import { expect, test } from '../support/extension';
import { resetHarness, waitForScoringSettled } from '../support/harness';

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http://localhost:5174')) await resetHarness(page);
});

test('wrong-call restores a hidden post and excludes it after reload', async ({ page }) => {
  await page.goto('/?fixture=high-frequency');
  await waitForScoringSettled(page);
  const placeholder = page.getByTestId('slopfilter-placeholder').first();
  await expect(placeholder).toBeVisible();
  const hiddenPostId = await placeholder.evaluate((element) =>
    element.previousElementSibling?.getAttribute('data-post-id'),
  );
  const placeholderCount = await page.getByTestId('slopfilter-placeholder').count();

  await placeholder.getByRole('button', { name: 'This was wrong' }).click();
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(placeholderCount - 1);
  await expect(page.locator(`article[data-post-id="${hiddenPostId}"]`)).toBeVisible();
  await page.reload();

  await expect(page.locator('article[data-post-id="high-frequency-0"]')).toBeVisible();
});

test('show anyway restores the post with injected feedback controls', async ({ page }) => {
  await page.goto('/?fixture=high-frequency');
  await waitForScoringSettled(page);
  const placeholder = page.getByTestId('slopfilter-placeholder').first();
  const postId = await placeholder.evaluate((element) =>
    element.previousElementSibling?.getAttribute('data-post-id'),
  );
  if (!postId) throw new Error('hidden post id missing');

  await placeholder.getByRole('button', { name: 'Show anyway' }).click();

  const post = page.locator(`article[data-post-id="${postId}"]`);
  await expect(post).toBeVisible();
  await expect(post.getByRole('button', { name: 'Not interested' })).toBeVisible();
  await expect(post.getByRole('button', { name: 'Account options' })).toBeVisible();
});

test('the not-interested control is keyboard reachable', async ({ page }) => {
  await page.goto('/');
  const post = page.locator('article[data-testid="tweet"]').first();
  await expect(post.getByRole('button', { name: 'Not interested' })).toBeVisible();
  await expect(post.getByTestId('slopfilter-feedback')).toHaveClass(/slopfilter-theme-x/);
  await expect(post.getByRole('button', { name: 'Not interested' })).toHaveCSS(
    'border-radius',
    '999px',
  );
  await post.getByRole('button', { name: 'Not interested' }).focus();
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Not interested');
});
