import { expect, test } from '../support/extension';

test('loads the unpacked extension and serves the harness timeline', async ({
  context,
  extensionId,
}) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);

  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByLabel('Timeline: Your Home Timeline')).toBeVisible();
});
