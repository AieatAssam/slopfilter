import { expect, test } from '../support/extension';
import type { HarnessPost } from '../support/harness';
import { fetchHomeTimeline } from '../support/harness';

const appendEphemeralPost = (page: import('@playwright/test').Page, post: HarnessPost) =>
  page.evaluate((value) => window.__slopfilterHarness.appendPost(value, false), post);

const HOME_TIMELINE_RE = /\/HomeTimeline/;

const article = (page: import('@playwright/test').Page, postId: string) =>
  page.locator(`article[data-post-id="${postId}"]`);

const openInspectorFor = async (
  page: import('@playwright/test').Page,
  postId: string,
): Promise<import('@playwright/test').Locator> => {
  const target = article(page, postId);
  await expect(target.getByTestId('slopfilter-inspector-trigger')).toBeVisible();
  await target.getByTestId('slopfilter-inspector-trigger').click();
  const inspector = page.getByTestId('slopfilter-inspector');
  await expect(inspector).toBeVisible();
  return inspector;
};

const readAuthorRecord = (page: import('@playwright/test').Page, handle: string) =>
  page.evaluate(
    (value) =>
      new Promise<unknown>((resolve) => {
        const request = indexedDB.open('slopfilter-author-activity');
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('authors', 'readonly');
          const getRequest = transaction.objectStore('authors').get(value.handle);
          getRequest.onsuccess = () => resolve(getRequest.result ?? null);
          getRequest.onerror = () => resolve(null);
        };
      }),
    { handle },
  );

test('intercepted author account age and post count reach the author record and feed the lifetime sub-signal', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();

  await fetchHomeTimeline(page);
  await expect(page.locator('html')).toHaveAttribute('data-slopfilter-payload-seen', 'true');

  const record = (await readAuthorRecord(page, '@account08')) as {
    profileJoinDate: number | null;
    profilePostCount: number | null;
    profileObservedAt: number | null;
  } | null;
  expect(record?.profileJoinDate).toBe(Date.parse('Mon Aug 03 12:00:00 +0000 2026'));
  expect(record?.profilePostCount).toBe(300);
  expect(record?.profileObservedAt).toBeGreaterThan(0);

  await appendEphemeralPost(page, {
    id: '1900000000000010696',
    authorHandle: '@account08',
    text: 'post from a payload-scored author',
    postedAt: '2026-08-10T08:00:00.000Z',
  });

  const inspector = await openInspectorFor(page, '1900000000000010696');
  await expect(inspector).toContainText('account only');
  await expect(inspector).toContainText('day across the account lifetime');
});

test('exact payload engagement supersedes the compact-count DOM parse for the same post', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();

  await fetchHomeTimeline(page);
  await expect(page.locator('html')).toHaveAttribute('data-slopfilter-payload-seen', 'true');

  // The DOM claims 600 likes and 100 views; the payload says 5 likes and 900000 views. Only the
  // exact payload values trip the weak-engagement sub-signal. If the DOM parse won, the reason
  // would not appear.
  await appendEphemeralPost(page, {
    id: '1900000000000026740',
    authorHandle: '@account19',
    text: 'exact engagement supersedes the DOM parse',
    postedAt: '2026-08-10T08:00:00.000Z',
    engagement: { likes: '600', reposts: '0', replies: '0', views: '100' },
  });

  const inspector = await openInspectorFor(page, '1900000000000026740');
  await expect(inspector).toContainText('high views with weak absolute engagement');
});

test('intercepting the timeline adds no additional network request', async ({ page }) => {
  const homeTimelineRequests: string[] = [];
  page.on('request', (request) => {
    if (HOME_TIMELINE_RE.test(request.url())) homeTimelineRequests.push(request.url());
  });

  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
  await fetchHomeTimeline(page);
  await expect(page.locator('html')).toHaveAttribute('data-slopfilter-payload-seen', 'true');

  expect(homeTimelineRequests).toHaveLength(1);
  expect(homeTimelineRequests[0]).toMatch(/\/HomeTimeline$/);
});
