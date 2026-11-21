import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SCORING_CONFIG } from '@/core/scoring/weights';
import {
  DEFAULT_SETTINGS,
  LEGACY_DEFAULT_WEIGHTS,
  loadSettings,
  onSettingsChanged,
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
    stored = { hideThreshold: 'abc', hideAds: 'yes', weights: { behavioural: 0.45 } };

    const settings = await loadSettings();

    expect(settings.hideThreshold).toBe(DEFAULT_SETTINGS.hideThreshold);
    expect(settings.hideAds).toBe(true);
    expect(settings.weights.behavioural).toBe(0.45);
    expect(settings.weights.taste).toBe(DEFAULT_SETTINGS.weights.taste);
  });

  test('migrates stored weights matching the old defaults to the recalibrated defaults', async () => {
    stored = { weights: { ...LEGACY_DEFAULT_WEIGHTS } };

    const settings = await loadSettings();

    expect(settings.weights).toEqual(DEFAULT_SETTINGS.weights);
  });

  test('migrates a legacy profile that predates the repetition layer', async () => {
    stored = {
      weights: {
        behavioural: 0.4,
        provenance: 0.1,
        'content-type': 0.2,
        'image-forensics': 0.1,
        taste: 0.2,
      },
    };

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
      cohortCutoff: '2023-06-15',
      cohortVolumeFloor: 15,
      cohortVolumeCeiling: 90,
      weights: { ...DEFAULT_SETTINGS.weights, behavioural: 0.45 },
      enabledLayers: { ...DEFAULT_SETTINGS.enabledLayers, taste: false },
    };

    await saveSettings(settings);

    await expect(loadSettings()).resolves.toEqual(settings);
  });

  test('clamps a cohort cutoff earlier than the documented minimum', async () => {
    stored = { cohortCutoff: '2010-01-01' };

    expect((await loadSettings()).cohortCutoff).toBe('2015-01-01');
  });

  test('repairs unparseable cohort values to the documented defaults', async () => {
    stored = { cohortCutoff: 'not a date', cohortVolumeFloor: -3, cohortVolumeCeiling: 'many' };

    const settings = await loadSettings();

    expect(settings.cohortCutoff).toBe(DEFAULT_SETTINGS.cohortCutoff);
    expect(settings.cohortVolumeFloor).toBe(DEFAULT_SETTINGS.cohortVolumeFloor);
    expect(settings.cohortVolumeCeiling).toBe(DEFAULT_SETTINGS.cohortVolumeCeiling);
  });

  test('raises a stored ceiling below the floor up to the floor', async () => {
    stored = { cohortVolumeFloor: 30, cohortVolumeCeiling: 10 };

    const settings = await loadSettings();

    expect(settings.cohortVolumeFloor).toBe(30);
    expect(settings.cohortVolumeCeiling).toBe(30);
  });

  test('derives the default threshold from the scoring config', () => {
    expect(DEFAULT_SETTINGS.hideThreshold).toBe(DEFAULT_SCORING_CONFIG.hideThreshold);
  });

  test('defaults the repetition layer on, with its documented weight', () => {
    expect(DEFAULT_SETTINGS.enabledLayers.repetition).toBe(true);
    expect(DEFAULT_SETTINGS.weights.repetition).toBe(DEFAULT_SCORING_CONFIG.weights.repetition);
  });

  test('defaults the optional text-pattern layer off and caps its weight', async () => {
    expect(DEFAULT_SETTINGS.enabledLayers['text-pattern']).toBe(false);
    stored = { enabledLayers: { 'text-pattern': true }, weights: { 'text-pattern': 1 } };
    const settings = await loadSettings();
    expect(settings.enabledLayers['text-pattern']).toBe(true);
    expect(settings.weights['text-pattern']).toBe(0.4);
  });

  test('clamps an out-of-range repetition weight to the default', async () => {
    stored = {
      weights: {
        ...DEFAULT_SETTINGS.weights,
        repetition: 7,
      },
    };

    expect((await loadSettings()).weights.repetition).toBe(DEFAULT_SETTINGS.weights.repetition);
  });

  test('migrates a legacy store onto the current defaults including repetition', async () => {
    stored = { weights: { ...LEGACY_DEFAULT_WEIGHTS } };

    await expect(loadSettings()).resolves.toMatchObject({
      weights: DEFAULT_SETTINGS.weights,
    });
  });
});

describe('onSettingsChanged', () => {
  const fireChange = (changes: Record<string, unknown>, areaName = 'local') => {
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]?.[0] as (
      changes: Record<string, unknown>,
      areaName: string,
    ) => void;
    listener(changes, areaName);
  };

  test('ignores unrelated keys such as onboardingShown', () => {
    const callback = vi.fn();
    onSettingsChanged(callback);

    fireChange({ onboardingShown: { newValue: true } });

    expect(callback).not.toHaveBeenCalled();
  });

  test('fires for scoring settings and account states', () => {
    const callback = vi.fn();
    onSettingsChanged(callback);

    fireChange({ hideThreshold: { newValue: 0.5 } });
    fireChange({ accountStates: { newValue: {} } });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('ignores changes from a non-local storage area', () => {
    const callback = vi.fn();
    onSettingsChanged(callback);

    fireChange({ hideThreshold: { newValue: 0.5 } }, 'sync');

    expect(callback).not.toHaveBeenCalled();
  });
});
