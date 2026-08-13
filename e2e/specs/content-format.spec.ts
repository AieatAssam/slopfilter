import { expect, test } from '../support/extension';
import { appendPost, resetHarness, uniqueRunId, waitForScoringSettled } from '../support/harness';

test.afterEach(async ({ page }) => {
  await resetHarness(page);
});

// SF-220: the structural content-type layer must fire and report a reason without any model in the
// loop. model-failure suppresses every model result, and the model layers are disabled in settings,
// so the inspector content-type row can only be explained by the structural signal.
const BAIT_TEXT = [
  'MEGA GIVEAWAY ALERT',
  'Follow @mega_giveaway for a chance to win!',
  '1. Like this post',
  '2. Repost it',
  '3. Comment your favourite',
  '4. Tag 2 friends',
  '#giveaway #win #free #prize #contest #raffle #sweepstakes #instantwin',
].join('\n');

const PLAIN_TEXT = 'Just back from a long hike in the hills. #weekend #nature';

test('structural content-type fires engagement-bait with every model layer disabled', async ({
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
      },
    }),
  );
  await options.close();

  await page.goto('/?model-failure=1');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await appendPost(page, {
    id: `${runId}-bait`,
    authorHandle: `@${runId}`,
    text: BAIT_TEXT,
    postedAt: '2026-08-05T10:00:00Z',
  });
  await appendPost(page, {
    id: `${runId}-plain`,
    authorHandle: `@${runId}`,
    text: PLAIN_TEXT,
    postedAt: '2026-08-05T10:01:00Z',
  });
  await waitForScoringSettled(page);

  const bait = page.locator(`article[data-post-id="${runId}-bait"]`);
  await bait.hover();
  await bait.getByRole('button', { name: 'Why this score' }).click();
  const inspector = page.getByTestId('slopfilter-inspector');
  await expect(inspector).toBeVisible();
  const baitRow = inspector.locator(
    '[data-testid="slopfilter-inspector-row"][data-layer="content-type"]',
  );
  await expect(baitRow).toContainText('asks for');
  await expect(baitRow).toContainText('hashtags');
  await expect(baitRow).toContainText('numbered list');
  await inspector.getByRole('button', { name: 'Close' }).click();

  const plain = page.locator(`article[data-post-id="${runId}-plain"]`);
  await plain.hover();
  await plain.getByRole('button', { name: 'Why this score' }).click();
  const inspectorTwo = page.getByTestId('slopfilter-inspector').last();
  await expect(inspectorTwo).toBeVisible();
  const plainRow = inspectorTwo.locator(
    '[data-testid="slopfilter-inspector-row"][data-layer="content-type"]',
  );
  await expect(plainRow).toContainText('below-cutoff');
  await expect(plainRow).not.toContainText('hashtags');
  await expect(plainRow).not.toContainText('asks for');
});

test('structural content-type stays below the hide threshold on its own', async ({
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
      },
    }),
  );
  await options.close();

  await page.goto('/?model-failure=1');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await appendPost(page, {
    id: `${runId}-bait`,
    authorHandle: `@${runId}`,
    text: BAIT_TEXT,
    postedAt: '2026-08-05T10:00:00Z',
  });
  await waitForScoringSettled(page);

  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
  const bait = page.locator(`article[data-post-id="${runId}-bait"]`);
  await bait.hover();
  await bait.getByRole('button', { name: 'Why this score' }).click();
  const inspector = page.getByTestId('slopfilter-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByTestId('slopfilter-inspector-totals')).toContainText(
    'verdict showed',
  );
  await expect(inspector.getByTestId('slopfilter-inspector-totals')).toContainText(
    'Composite 0.42',
  );
});
