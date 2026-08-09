import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SCORING_CONFIG } from '@/core/scoring/weights';
import {
  DEFAULT_SETTINGS,
  LEGACY_DEFAULT_WEIGHTS,
  loadSettings,
  saveSettings,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
} from '@/storage/settings';

let stored: Record<string, unknown>;

beforeEach(() => {
  stored = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async () => stored),
        set: vi.fn(async (value: Record<string, unknown>) => Object.assign(stored, value)),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('settings', () => {
  test('returns defaults for an empty store', async () => {
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    await expect(loadSettings()).resolves.toMatchObject({ hideAds: true });
  });

  test('repairs a corrupt store field by field', async () => {
    stored = { hideThreshold: 'abc', hideAds: 'yes', weights: { behavioural: 0.4 } };

    const settings = await loadSettings();

    expect(settings.hideThreshold).toBe(DEFAULT_SETTINGS.hideThreshold);
    expect(settings.hideAds).toBe(true);
    expect(settings.weights.behavioural).toBe(0.4);
    expect(settings.weights.taste).toBe(DEFAULT_SETTINGS.weights.taste);
  });

  test('migrates stored weights matching the old defaults to the recalibrated defaults', async () => {
    stored = { weights: { ...LEGACY_DEFAULT_WEIGHTS } };

    const settings = await loadSettings();

    expect(settings.weights).toEqual(DEFAULT_SETTINGS.weights);
  });

  test('leaves user-modified weights untouched by the migration', async () => {
    const modified = { ...LEGACY_DEFAULT_WEIGHTS, behavioural: 0.85 };
    stored = { weights: modified };

    const settings = await loadSettings();

    expect(settings.weights).toEqual(modified);
    expect(settings.weights.behavioural).toBe(0.85);
  });

  test('clamps an out-of-range threshold', async () => {
    stored = { hideThreshold: -1 };
    expect((await loadSettings()).hideThreshold).toBe(THRESHOLD_MIN);

    stored = { hideThreshold: 2 };
    expect((await loadSettings()).hideThreshold).toBe(THRESHOLD_MAX);
  });

  test('round-trips a valid settings object through save and load', async () => {
    const settings = {
      hideThreshold: 0.8,
      hideAds: false,
      weights: { ...DEFAULT_SETTINGS.weights, behavioural: 0.4 },
      enabledLayers: { ...DEFAULT_SETTINGS.enabledLayers, taste: false },
    };

    await saveSettings(settings);

    await expect(loadSettings()).resolves.toEqual(settings);
  });

  test('derives the default threshold from the scoring config', () => {
    expect(DEFAULT_SETTINGS.hideThreshold).toBe(DEFAULT_SCORING_CONFIG.hideThreshold);
  });
});
