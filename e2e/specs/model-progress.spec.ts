import type { BrowserContext } from '@playwright/test';
import { expect, test } from '../support/extension';

const blockModelHost = async (context: BrowserContext) => {
  await context.route('**huggingface.co/**', (route) => route.abort());
  await context.route('**hf.co/**', (route) => route.abort());
};

const openPopup = async (context: BrowserContext, extensionId: string) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);
  return popup;
};

test('the feed still renders and the popup reports reduced filtering when models cannot load', async ({
  context,
  extensionId,
}) => {
  await blockModelHost(context);
  const page = await context.newPage();
  await page.goto('/?model-failure=1');

  await expect(page.getByTestId('tweet').first()).toBeVisible();
  const popup = await openPopup(context, extensionId);
  const status = popup.getByTestId('slopfilter-model-status');
  await expect(status).toContainText('less is being filtered', { timeout: 15_000 });
  await expect(popup.getByRole('button', { name: 'Retry model download' })).toBeVisible();
  await expect(status).not.toContainText(/\b(ai|generated|synthetic|authored)\b/i);
  await popup.close();
  await page.close();
});

test('failed model loading never hides posts that only unavailable signals could score', async ({
  context,
  extensionId,
}) => {
  await blockModelHost(context);
  const page = await context.newPage();
  await page.goto('/?model-failure=1');

  await expect(page.getByTestId('tweet')).toHaveCount(3);
  await expect(page.getByTestId('slopfilter-placeholder')).toHaveCount(0);
  await expect(page.getByTestId('tweetText')).toHaveCount(3);

  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId('slopfilter-model-status')).toContainText(
    'less is being filtered',
    {
      timeout: 15_000,
    },
  );
  await popup.close();
  await page.close();
});
