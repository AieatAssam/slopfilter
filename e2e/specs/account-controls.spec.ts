import { expect, test } from '../support/extension';
import { appendPost, resetHarness, uniqueRunId, waitForScoringSettled } from '../support/harness';

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

test('muting an account collapses its posts and trusting restores them', async ({
  page,
}, testInfo) => {
  const runId = uniqueRunId(testInfo);
  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await appendPost(page, {
    id: `${runId}-post`,
    authorHandle: `@${runId}`,
    text: `body ${runId}`,
    postedAt: '2026-08-05T10:00:00.000Z',
  });

  await expect(page.getByRole('button', { name: 'Account options' }).last()).toBeVisible();
  await page.locator(`article[data-post-id="${runId}-post"]`).hover();
  await page.getByRole('button', { name: 'Account options' }).last().click();
  await page.getByRole('button', { name: 'Mute this account' }).click();

  await expect(page.getByTestId('slopfilter-placeholder').last()).toContainText(
    'you muted this account',
  );
  await page.getByRole('button', { name: 'Account options' }).last().click();
  await page.getByRole('button', { name: 'Always show this account' }).click();

  await expect(page.getByText(`body ${runId}`)).toBeVisible();
  expect(await page.getByTestId('slopfilter-placeholder').count()).toBe(0);
});

test('trust keeps high-frequency posts visible', async ({ page }) => {
  await page.goto('/?fixture=high-frequency');
  await waitForScoringSettled(page);
  await expect(page.getByTestId('slopfilter-placeholder').first()).toBeVisible();

  await page.getByRole('button', { name: 'Account options' }).first().click();
  await page.getByRole('button', { name: 'Always show this account' }).click();

  await expect(page.locator('article[data-testid="tweet"]')).toHaveCount(10);
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
});
