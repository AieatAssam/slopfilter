import { expect, test } from '../support/extension';
import { appendPost, resetHarness, uniqueRunId, waitForScoringSettled } from '../support/harness';

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

test('a maximal optional text-pattern score stays visible and has no reason label', async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  const runId = uniqueRunId(testInfo);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  await options.evaluate(() =>
    chrome.storage.local.set({
      enabledLayers: {
        behavioural: false,
        provenance: false,
        'content-type': false,
        'image-forensics': false,
        taste: false,
        repetition: false,
        'text-pattern': true,
      },
      weights: { 'text-pattern': 0.4 },
    }),
  );
  await options.close();

  await page.goto('/?model-failure=1&text-pattern-max=1');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await appendPost(page, {
    id: `${runId}-long`,
    authorHandle: `@${runId}`,
    text: 'A long post that is deliberately above the optional detector minimum. '.repeat(8),
    postedAt: '2026-08-05T10:00:00Z',
  });
  await waitForScoringSettled(page);

  const article = page.locator(`article[data-post-id="${runId}-long"]`);
  await expect(article).toBeVisible();
  await article.hover();
  await article.getByRole('button', { name: 'Why this score' }).click();
  const inspector = page.getByTestId('slopfilter-inspector');
  const row = inspector.locator(
    '[data-testid="slopfilter-inspector-row"][data-layer="text-pattern"]',
  );
  await expect(row).toContainText('raw 1.00');
  await expect(row).toContainText('trentmkelly/slop-detector-mini-2');
  await expect(row).toContainText('unreliable on short posts');
  await expect(row).not.toContainText(/reason/i);
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
});
