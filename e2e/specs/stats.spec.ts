import { expect, test } from '../support/extension';
import {
  appendPost,
  fetchHomeTimeline,
  fixtureNowUrl,
  resetHarness,
  waitForScoringSettled,
} from '../support/harness';

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http://localhost:5174')) await resetHarness(page);
});

test('the popup reports non-zero counts after filtering and clears them', async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto('/?fixture=high-frequency');
  await expect(page.locator('article[data-testid="tweet"]')).toHaveCount(10);
  await waitForScoringSettled(page);
  await expect(page.getByTestId('slopfilter-placeholder').first()).toBeVisible();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts seen: 10');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText(/Posts hidden: [1-9]/);

  await popup.getByRole('button', { name: 'Clear statistics' }).click();
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts seen: 0');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts hidden: 0');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('not enough data yet');
  await popup.close();
});

test('a fresh profile suppresses the wrong-call rate', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);

  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts seen: 0');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts hidden: 0');
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('not enough data yet');
  await popup.close();
});

test('a late payload re-score does not count the same feed post twice', async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto(fixtureNowUrl());
  await waitForScoringSettled(page);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);
  await popup.getByRole('button', { name: 'Clear statistics' }).click();
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts seen: 0');

  await appendPost(page, {
    id: 'late-payload-stats-post',
    authorHandle: '@account08',
    text: 'one visible post before account metadata arrives',
    postedAt: '2026-08-10T08:00:00.000Z',
  });
  await waitForScoringSettled(page);
  await popup.reload();
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts seen: 1');

  const rescored = page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        window.addEventListener('slopfilter-batch-scored', () => resolve(), { once: true }),
      ),
  );
  await fetchHomeTimeline(page);
  await rescored;
  await popup.reload();
  await expect(popup.getByTestId('slopfilter-stats')).toContainText('Posts seen: 1');
  await popup.close();
});
