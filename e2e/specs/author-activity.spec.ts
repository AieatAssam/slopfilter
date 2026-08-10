import { expect, test } from '../support/extension';
import type { HarnessPost } from '../support/harness';
import { uniqueRunId, waitForScoringSettled } from '../support/harness';

const appendEphemeralPost = (page: import('@playwright/test').Page, post: HarnessPost) =>
  page.evaluate((value) => window.__slopfilterHarness.appendPost(value, false), post);

test('scores an author from sightings accumulated across page loads', async ({
  page,
}, testInfo) => {
  const runId = uniqueRunId(testInfo);
  const handle = `@acc-${runId}`;

  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();

  await appendEphemeralPost(page, {
    id: `${runId}-a`,
    authorHandle: handle,
    text: `${runId} first sighting`,
    postedAt: '2026-08-05T07:00:00.000Z',
  });
  await appendEphemeralPost(page, {
    id: `${runId}-b`,
    authorHandle: handle,
    text: `${runId} second sighting`,
    postedAt: '2026-08-05T07:12:00.000Z',
  });
  await appendEphemeralPost(page, {
    id: `${runId}-c`,
    authorHandle: handle,
    text: `${runId} third sighting`,
    postedAt: '2026-08-05T07:24:00.000Z',
  });
  await appendEphemeralPost(page, {
    id: `${runId}-d`,
    authorHandle: handle,
    text: `${runId} fourth sighting`,
    postedAt: '2026-08-05T07:36:00.000Z',
  });

  // Four posts inside an hour: the in-viewport derivation has no rate, so the behaviour layer must
  // stay silent and nothing hides.
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
  await expect(page.getByText(`${runId} fourth sighting`)).toBeVisible();
  await waitForScoringSettled(page);

  // Reload wipes the viewport but the activity cache survives. A fifth sighting one hour after the
  // first gives 5 distinct posts over the minimum span: 96/day. The single viewport never had that.
  await page.reload();
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await appendEphemeralPost(page, {
    id: `${runId}-e`,
    authorHandle: handle,
    text: `${runId} fifth sighting`,
    postedAt: '2026-08-05T08:00:00.000Z',
  });
  await waitForScoringSettled(page);

  const placeholders = page.getByTestId('slopfilter-placeholder');
  await expect(placeholders.first()).toBeVisible();
  await expect(placeholders.first()).toContainText('posts 96+ times per day');
});

test('repeated sightings of the same post id do not inflate the rate', async ({ page }) => {
  await page.goto('/?fixture=high-frequency');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await waitForScoringSettled(page);
  const placeholders = page.getByTestId('slopfilter-placeholder');
  await expect(placeholders.first()).toBeVisible();
  await expect(placeholders.first()).toContainText('posts 180+ times per day');

  await page.reload();
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await waitForScoringSettled(page);
  await expect(page.getByTestId('slopfilter-placeholder').first()).toBeVisible();
  // Ten distinct post ids over an hour still max at ten; a sighting-count slip would double the rate.
  await expect(page.getByTestId('slopfilter-placeholder').first()).toContainText(
    'posts 180+ times per day',
  );
});
