import {
  DEFAULT_SETTINGS,
  LAYER_IDS,
  loadSettings,
  type Settings,
  saveSettings,
} from '@/storage/settings';

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

  for (const layerId of LAYER_IDS) {
    input(`weight-${layerId}`).value = String(settings.weights[layerId]);
    input(`enable-${layerId}`).checked = settings.enabledLayers[layerId];
  }
};

const read = (): Settings => ({
  hideThreshold: Number(input('hide-threshold').value),
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
    void saveSettings(read())
      .then(() => setStatus('Saved.'))
      .catch(() => setStatus('Could not save settings.'));
  });
};

void start();
