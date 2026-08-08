import { expect, test } from '../support/extension';

test('popup explains local model readiness and degraded mode', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);

  const status = popup.getByTestId('slopfilter-model-status');
  await expect(status).toBeVisible();
  await expect(status).toHaveText(
    /Models have not started loading|Loading the filter models|All filters active|Some filters are unavailable/,
  );
  if (process.env.SLOPFILTER_MODEL_SMOKE === '1') {
    await expect(status).toHaveText('All filters active.', { timeout: 120_000 });
  }
  await popup.close();
});
