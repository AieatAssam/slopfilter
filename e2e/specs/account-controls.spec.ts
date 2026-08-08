import { expect, test } from '../support/extension';
import { appendPost, resetHarness, uniqueRunId } from '../support/harness';

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

test('muting an account collapses its posts and trusting restores them', async ({
  page,
}, testInfo) => {
  const runId = uniqueRunId(testInfo);
  await page.goto('/');
  await appendPost(page, {
    id: `${runId}-post`,
    authorHandle: `@${runId}`,
    text: `body ${runId}`,
    postedAt: '2026-08-05T10:00:00.000Z',
  });

  await expect(page.getByRole('button', { name: 'Account options' }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Account options' }).last().click();
  await page.getByRole('button', { name: 'Mute this account' }).click();
  await page.reload();

  await expect(page.getByTestId('slopfilter-placeholder').last()).toContainText(
    'you muted this account',
  );
  await page.getByRole('button', { name: 'Account options' }).last().click();
  await page.getByRole('button', { name: 'Always show this account' }).click();
  await page.reload();

  await expect(page.getByText(`body ${runId}`)).toBeVisible();
  expect(await page.getByTestId('slopfilter-placeholder').count()).toBe(0);
});

test('trust keeps high-frequency posts visible', async ({ page }) => {
  await page.goto('/?fixture=high-frequency');
  await expect(page.getByTestId('slopfilter-placeholder').first()).toBeVisible();

  await page.getByRole('button', { name: 'Account options' }).first().click();
  await page.getByRole('button', { name: 'Always show this account' }).click();
  await page.reload();

  await expect(page.locator('article[data-testid="tweet"]')).toHaveCount(10);
  expect(await page.getByTestId('slopfilter-placeholder').count()).toBe(0);
});
