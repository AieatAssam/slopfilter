import { expect, test } from '../support/extension';
import { appendPost, resetHarness, uniqueRunId } from '../support/harness';

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

test('collapses a post with its reason label and restores it on Show anyway', async ({
  page,
  extensionId,
}, testInfo) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();

  const runId = uniqueRunId(testInfo);
  const text = `body ${runId}`;
  await appendPost(page, {
    id: `${runId}-post`,
    authorHandle: `@${runId}`,
    text,
    postedAt: '2026-08-05T10:00:00Z',
  });
  await expect(page.getByText(text)).toBeVisible();

  const reasons = ['posts 40+ times per day', 'high views, very little engagement'];
  const [frequencyReason, engagementReason] = reasons;
  if (!frequencyReason || !engagementReason) throw new Error('test reasons missing');
  await page.evaluate((value) => window.__slopfilterHarness.collapseFirstPost(value), reasons);
  const placeholder = page.getByTestId('slopfilter-placeholder');
  await expect(placeholder).toBeVisible();
  await expect(placeholder).toContainText(frequencyReason);
  await expect(placeholder).toContainText(engagementReason);
  await expect(page.getByText(text)).not.toBeVisible();

  await page.getByRole('button', { name: 'Show anyway' }).click();
  await expect(placeholder).toHaveCount(0);
  await expect(page.getByText(text)).toBeVisible();
});

test('collapse is idempotent and never displays an authorship claim', async ({
  page,
  extensionId,
}, testInfo) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();

  const runId = uniqueRunId(testInfo);
  await appendPost(page, {
    id: `${runId}-post`,
    authorHandle: `@${runId}`,
    text: `body ${runId}`,
    postedAt: '2026-08-05T10:00:00Z',
  });
  const reasons = ['posts 40+ times per day'];
  await page.evaluate((value) => {
    window.__slopfilterHarness.collapseFirstPost(value);
    window.__slopfilterHarness.collapseFirstPost(value);
  }, reasons);

  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(1);
  await expect(page.getByTestId('slopfilter-placeholder')).not.toContainText(
    /\b(ai|generated|synthetic|authored)\b/i,
  );
});
