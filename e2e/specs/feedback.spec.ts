import { expect, test } from '../support/extension';
import { resetHarness, waitForScoringSettled } from '../support/harness';

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http://localhost:5174')) await resetHarness(page);
});

test('wrong-call restores a hidden post and excludes it after reload', async ({ page }) => {
  await page.goto('/?fixture=high-frequency');
  await expect(page.locator('article[data-testid="tweet"]')).toHaveCount(10);
  await waitForScoringSettled(page);
  const placeholder = page.getByTestId('slopfilter-placeholder').first();
  await expect(placeholder).toBeVisible();
  const hiddenPostId = await placeholder.evaluate((element) =>
    element.previousElementSibling?.getAttribute('data-post-id'),
  );
  await placeholder.getByRole('button', { name: 'This was wrong' }).click();
  const post = page.locator(`article[data-post-id="${hiddenPostId}"]`);
  await expect(post).toBeVisible();
  await expect(
    post.locator('xpath=following-sibling::*[1][@data-testid="slopfilter-placeholder"]'),
  ).toHaveCount(0);
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

test('not interested shows immediate progress while feedback is saved', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('article[data-testid="tweet"]').first().getByRole('button', {
    name: 'Not interested',
  });
  await button.click({ noWaitAfter: true });
  await expect(button).toHaveText(/Saving…|Saved/);
  await expect(button).toBeDisabled();
});
