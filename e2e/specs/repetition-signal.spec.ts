import { expect, test } from '../support/extension';
import { appendPost, resetHarness, uniqueRunId, waitForScoringSettled } from '../support/harness';

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

// SF-219: near-duplicate scoring against the corpus of posts already observed in this feed. The
// harness runs in model-failure plus fixture-embeddings mode: every model result is suppressed, so
// the score-batch response carries no classifier, and each post instead gets a deterministic
// embedding derived from its text. Identical template text therefore scores cosine 1.0 against the
// corpus while any unrelated text stays far away. The repetition layer is the only signal that can
// explain the cluster, so the assertions are attributable to it alone.
const TEMPLATE_TEXT =
  'Our brand new platform just shipped the long awaited dashboard update and our whole team worked late shifts to polish the migration for every beta member who requested it';

const UNRELATED_TEXT =
  'The city parks department announced free Sunday yoga sessions on the main lawn starting next month, and preregistration opens on the website at noon today.';

const TEMPLATE_HANDLES = [
  '@launch-deck',
  '@brand-notes',
  '@release-desk',
  '@shipping-hub',
  '@beta-updates',
  '@platform-news',
];

const openInspector = async (
  article: import('@playwright/test').Locator,
  page: import('@playwright/test').Page,
) => {
  await article.hover();
  await article.getByRole('button', { name: 'Why this score' }).click();
  const inspector = page.getByTestId('slopfilter-inspector').last();
  await expect(inspector).toBeVisible();
  return inspector;
};

const repetitionRow = (inspector: import('@playwright/test').Locator) =>
  inspector.locator('[data-testid="slopfilter-inspector-row"][data-layer="repetition"]');

test('a template repeated across six handles is the only text the repetition layer affects', async ({
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
        behavioural: true,
        provenance: false,
        'content-type': true,
        'image-forensics': false,
        taste: false,
        repetition: true,
      },
    }),
  );
  await options.close();

  await page.goto('/?model-failure=1&fixture-embeddings=1');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();

  const appendTemplate = (handle: string, index: number) =>
    appendPost(page, {
      id: `${runId}-template-${index}`,
      authorHandle: handle,
      text: TEMPLATE_TEXT,
      postedAt: `2026-08-05T10:0${index}:00Z`,
    });
  for (const [index, handle] of TEMPLATE_HANDLES.entries()) await appendTemplate(handle, index);
  await appendPost(page, {
    id: `${runId}-unrelated`,
    authorHandle: '@weather-notes',
    text: UNRELATED_TEXT,
    postedAt: '2026-08-05T10:10:00Z',
  });
  await waitForScoringSettled(page);

  // The final template post in the batch has seen the other five, so its repetition row names the
  // exact count. The first template post had an empty corpus (the baseline fixture texts are all
  // under the length gate) and must report no data rather than fire.
  const lastTemplate = page.locator(`article[data-post-id="${runId}-template-5"]`);
  const inspectorLast = await openInspector(lastTemplate, page);
  const repetitionLast = repetitionRow(inspectorLast);
  await expect(repetitionLast).toContainText('near-identical to 5 other posts in this feed');
  await expect(repetitionLast).not.toContainText(/\b(ai|generated|synthetic|authored|bot)\b/i);
  await inspectorLast.getByRole('button', { name: 'Close' }).click();
  await expect(inspectorLast).toBeHidden();

  const firstTemplate = page.locator(`article[data-post-id="${runId}-template-0"]`);
  const inspectorFirst = await openInspector(firstTemplate, page);
  const repetitionFirst = repetitionRow(inspectorFirst);
  await expect(repetitionFirst).toContainText('no-data');
  await expect(repetitionFirst).not.toContainText('near-identical to');
  await inspectorFirst.getByRole('button', { name: 'Close' }).click();
  await expect(inspectorFirst).toBeHidden();

  const unrelated = page.locator(`article[data-post-id="${runId}-unrelated"]`);
  const inspectorUnrelated = await openInspector(unrelated, page);
  const repetitionUnrelated = repetitionRow(inspectorUnrelated);
  await expect(repetitionUnrelated).toContainText('below-cutoff');
  await expect(repetitionUnrelated).not.toContainText('near-identical to');
  await inspectorUnrelated.getByRole('button', { name: 'Close' }).click();

  // Repetition is a lift, never a veto: the six-post cluster still renders below the hide threshold.
  await expect(page.locator(`article[data-post-id="${runId}-template-5"]`)).toBeVisible();
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
});

test('a disabled repetition layer stops the signal without affecting other layers', async ({
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
        behavioural: true,
        provenance: false,
        'content-type': true,
        'image-forensics': false,
        taste: false,
        repetition: false,
      },
    }),
  );
  await options.close();

  await page.goto('/?model-failure=1&fixture-embeddings=1');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  for (const [index, handle] of TEMPLATE_HANDLES.entries()) {
    await appendPost(page, {
      id: `${runId}-t-${index}`,
      authorHandle: handle,
      text: TEMPLATE_TEXT,
      postedAt: `2026-08-05T10:0${index}:00Z`,
    });
  }
  await waitForScoringSettled(page);

  const post = page.locator(`article[data-post-id="${runId}-t-5"]`);
  const inspector = await openInspector(post, page);
  const disabledRow = repetitionRow(inspector);
  await expect(disabledRow).toHaveAttribute('data-status', 'disabled');
  await expect(disabledRow).not.toContainText('near-identical to');
});
