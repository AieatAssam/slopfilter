import { expect, test } from '../support/extension';
import { appendPost, resetHarness, uniqueRunId } from '../support/harness';

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

test('collapses high-frequency posts with an evidence-based reason', async ({ page }) => {
  await page.goto('/?fixture=high-frequency');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();

  const placeholders = page.getByTestId('slopfilter-placeholder');
  await expect(placeholders.first()).toBeVisible();
  await expect(placeholders.first()).toHaveClass(/slopfilter-theme-x/);
  await expect(placeholders.first()).toContainText(/posts \d+\+ times per day/);
  await expect(placeholders.first()).not.toContainText(/\b(ai|generated|synthetic|authored)\b/i);
  await expect(page.locator('article[data-testid="tweet"]')).toHaveCount(10);

  const beforeRestore = await placeholders.count();
  await page.getByRole('button', { name: 'Show anyway' }).first().click();
  await expect(placeholders).toHaveCount(beforeRestore - 1);
  await expect(page.locator('article[data-testid="tweet"]').first()).toBeVisible();
});

test('a single loud layer reaches the additive threshold while the other layers stay quiet', async ({
  page,
}) => {
  await page.goto('/?fixture=high-frequency');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();

  const placeholders = page.getByTestId('slopfilter-placeholder');
  await expect(placeholders.first()).toBeVisible();
  await expect(placeholders.first()).toContainText(/posts \d+\+ times per day/);

  await placeholders.first().getByRole('button', { name: 'Why this score' }).click();
  const inspector = page.getByTestId('slopfilter-inspector');
  await expect(inspector).toBeVisible();
  const totals = await inspector.getByTestId('slopfilter-inspector-totals').textContent();
  expect(totals).toContain('Composite 0.60');

  const rows = inspector.locator('[data-testid="slopfilter-inspector-row"]');
  const behavioralRow = rows.filter({ hasText: 'behavioural' });
  await expect(behavioralRow).toContainText('contribution 0.60');
  const content = (await rows.allTextContents()).join('\n');
  expect(content).toMatch(/\bprovenance\b/);
  expect(content).toMatch(/\bcontent-type\b/);
  expect(content).toMatch(/\bimage-forensics\b/);
  expect(content).toMatch(/\btaste\b/);
});

test('keeps a high-view post with meaningful likes and reposts visible', async ({ page }) => {
  await page.goto('/?fixture=engagement-popular');

  await expect(page.getByText('Popular post with meaningful engagement.')).toBeVisible();
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
});

test('collapses an X-marked advertisement by default with an advertisement reason', async ({
  page,
}) => {
  await page.goto('/?fixture=advertisement');

  await expect(page.getByTestId('slopfilter-placeholder')).toContainText('advertisement');
  await expect(page.locator('article[data-testid="tweet"]')).toBeHidden();
});

test('leaves an ordinary author visible and filters nothing when paused', async ({
  page,
}, testInfo) => {
  const runId = uniqueRunId(testInfo);
  const text = `ordinary ${runId}`;
  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await appendPost(page, {
    id: `${runId}-post`,
    authorHandle: `@${runId}`,
    text,
    postedAt: '2026-08-05T10:00:00Z',
  });

  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);

  await page.goto('/?fixture=broken');
  await expect(page.locator('article[data-testid="tweet"]').first()).toBeVisible();
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
});
