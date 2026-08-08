import { readFileSync } from 'node:fs';
import { expect, test } from '../support/extension';

test('exporting and re-importing restores a changed threshold', async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  const threshold = options.getByLabel('Hide threshold');
  await threshold.fill('0.42');
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');

  const downloadPromise = options.waitForEvent('download');
  await options.getByRole('button', { name: 'Export settings' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('settings export did not produce a file');
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  expect(parsed.schemaVersion).toBe(1);
  expect(raw).not.toMatch(/"(vector|embedding|text)"/);

  await threshold.fill('0.9');
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');
  await options.getByLabel('Import settings').setInputFiles({
    name: 'slopfilter-settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await expect(options.getByTestId('slopfilter-io-status')).toHaveText('Settings imported.');
  await expect(threshold).toHaveValue('0.42');
  await options.close();
});

test('malformed settings leave the current threshold untouched', async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  const threshold = options.getByLabel('Hide threshold');
  await threshold.fill('0.37');
  await expect(options.getByTestId('slopfilter-settings-status')).toHaveText('Saved.');

  await options.getByLabel('Import settings').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not json'),
  });
  await expect(options.getByTestId('slopfilter-io-status')).toContainText('Could not parse');
  await expect(threshold).toHaveValue('0.37');
  await options.close();
});
