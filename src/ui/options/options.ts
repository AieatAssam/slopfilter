import {
  DEFAULT_SETTINGS,
  LAYER_IDS,
  loadSettings,
  type Settings,
  saveSettings,
} from '@/storage/settings';
import { exportConfig, importConfig } from '@/storage/settingsIo';

const form = document.querySelector('form');
const status = document.querySelector('[data-testid="slopfilter-settings-status"]');
const input = (id: string): HTMLInputElement => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`missing settings input: ${id}`);
  return element;
};

const render = (settings: Settings) => {
  const threshold = input('hide-threshold');
  threshold.value = String(settings.hideThreshold);
  const output = document.getElementById('hide-threshold-value');
  if (output) output.textContent = settings.hideThreshold.toFixed(2);
  input('hide-ads').checked = settings.hideAds;

  for (const layerId of LAYER_IDS) {
    input(`weight-${layerId}`).value = String(settings.weights[layerId]);
    input(`enable-${layerId}`).checked = settings.enabledLayers[layerId];
  }
};

const read = (): Settings => ({
  hideThreshold: Number(input('hide-threshold').value),
  hideAds: input('hide-ads').checked,
  weights: Object.fromEntries(
    LAYER_IDS.map((layerId) => [layerId, Number(input(`weight-${layerId}`).value)]),
  ) as Settings['weights'],
  enabledLayers: Object.fromEntries(
    LAYER_IDS.map((layerId) => [layerId, input(`enable-${layerId}`).checked]),
  ) as Settings['enabledLayers'],
});

const setStatus = (message: string) => {
  if (status) status.textContent = message;
};

const setIoStatus = (message: string) => {
  const ioStatus = document.querySelector('[data-testid="slopfilter-io-status"]');
  if (ioStatus) ioStatus.textContent = message;
};

const persistCurrentSettings = () => {
  void saveSettings(read())
    .then(() => setStatus('Saved.'))
    .catch(() => setStatus('Could not save settings.'));
};

const resetControl = (id: string) => {
  if (id === 'hide-threshold') {
    input(id).value = String(DEFAULT_SETTINGS.hideThreshold);
  } else if (id === 'hide-ads') {
    input(id).checked = DEFAULT_SETTINGS.hideAds;
  } else if (id.startsWith('weight-')) {
    const layerId = id.slice('weight-'.length) as keyof Settings['weights'];
    input(id).value = String(DEFAULT_SETTINGS.weights[layerId]);
  } else if (id.startsWith('enable-')) {
    const layerId = id.slice('enable-'.length) as keyof Settings['enabledLayers'];
    input(id).checked = DEFAULT_SETTINGS.enabledLayers[layerId];
  }
  render(read());
  persistCurrentSettings();
};

const wireConfigIo = () => {
  document.getElementById('export-settings')?.addEventListener('click', () => {
    void exportConfig()
      .then((config) => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'slopfilter-settings.json';
        anchor.click();
        URL.revokeObjectURL(url);
        setIoStatus('Settings exported.');
      })
      .catch(() => setIoStatus('Could not export settings.'));
  });

  document.getElementById('import-settings')?.addEventListener('change', (event) => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    void input.files[0]
      .text()
      .then(importConfig)
      .then(async (result) => {
        if (!result.ok) {
          setIoStatus(result.message);
          return;
        }
        render(await loadSettings());
        setIoStatus('Settings imported.');
      })
      .catch(() => setIoStatus('Could not import settings.'));
  });
};

const start = async () => {
  try {
    render(await loadSettings());
  } catch {
    render(DEFAULT_SETTINGS);
    setStatus('Using defaults.');
  }

  const threshold = input('hide-threshold');
  threshold.addEventListener('input', () => {
    const output = document.getElementById('hide-threshold-value');
    if (output) output.textContent = Number(threshold.value).toFixed(2);
  });
  form?.addEventListener('change', () => {
    persistCurrentSettings();
  });
  form?.addEventListener('input', () => {
    persistCurrentSettings();
  });
  for (const reset of document.querySelectorAll<HTMLButtonElement>('[data-reset]')) {
    reset.addEventListener('click', () => resetControl(reset.dataset.reset ?? ''));
  }
  wireConfigIo();
};

void start();
