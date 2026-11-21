import type { LayerId } from '@/core/scoring/types';
import {
  DEFAULT_COHORT_CONFIG,
  DEFAULT_SCORING_CONFIG,
  TEXT_PATTERN_DEFAULTS,
} from '@/core/scoring/weights';

export const THRESHOLD_MIN = 0;
export const THRESHOLD_MAX = 1;

// SF-217: account-creation cutoffs earlier than this are almost certainly a bad value, so the stored
// cutoff is clamped to it instead of being trusted.
export const COHORT_CUTOFF_MIN_ISO = '2015-01-01T00:00:00.000Z';

export const LAYER_IDS: readonly LayerId[] = [
  'behavioural',
  'provenance',
  'content-type',
  'image-forensics',
  'taste',
  'repetition',
  'text-pattern',
];

// Weights shipped before SF-214 recalibrated scoring from a weighted mean to an additive sum.
// Stored weights still equal to these are migrated to the new defaults; anything else is a
// user-modified profile and stays untouched.
export const LEGACY_DEFAULT_WEIGHTS: Record<LayerId, number> = {
  behavioural: 0.4,
  provenance: 0.1,
  'content-type': 0.2,
  'image-forensics': 0.1,
  taste: 0.2,
  repetition: 0.3,
  'text-pattern': 0.4,
};

export interface Settings {
  hideThreshold: number;
  hideAds: boolean;
  weights: Record<LayerId, number>;
  enabledLayers: Record<LayerId, boolean>;
  // SF-217: the cohort sub-signal's user-tunable inputs. The cutoff is a calendar date describing
  // when an account was created; the floor and ceiling are the posting-volume ramp endpoints.
  cohortCutoff: string;
  cohortVolumeFloor: number;
  cohortVolumeCeiling: number;
}

export const DEFAULT_SETTINGS: Settings = {
  hideThreshold: DEFAULT_SCORING_CONFIG.hideThreshold,
  hideAds: true,
  weights: { ...DEFAULT_SCORING_CONFIG.weights },
  enabledLayers: {
    ...Object.fromEntries(LAYER_IDS.map((layerId) => [layerId, true])),
    'text-pattern': false,
  } as Record<LayerId, boolean>,
  cohortCutoff: new Date(DEFAULT_COHORT_CONFIG.cutoff).toISOString().slice(0, 10),
  cohortVolumeFloor: DEFAULT_COHORT_CONFIG.volumeFloorPerDay,
  cohortVolumeCeiling: DEFAULT_COHORT_CONFIG.volumeCeilingPerDay,
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const readThreshold = (value: unknown): number => {
  if (!isFiniteNumber(value)) return DEFAULT_SETTINGS.hideThreshold;
  return Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, value));
};

const readHideAds = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : DEFAULT_SETTINGS.hideAds;

const readWeights = (value: unknown): Record<LayerId, number> => {
  const stored = typeof value === 'object' && value !== null ? value : {};
  return Object.fromEntries(
    LAYER_IDS.map((layerId) => {
      const candidate = (stored as Record<string, unknown>)[layerId];
      return [
        layerId,
        isFiniteNumber(candidate) && candidate >= 0 && candidate <= 1
          ? layerId === 'text-pattern'
            ? Math.min(candidate, TEXT_PATTERN_DEFAULTS.weightCap)
            : candidate
          : DEFAULT_SETTINGS.weights[layerId],
      ];
    }),
  ) as Record<LayerId, number>;
};

const readEnabledLayers = (value: unknown): Record<LayerId, boolean> => {
  const stored = typeof value === 'object' && value !== null ? value : {};
  return Object.fromEntries(
    LAYER_IDS.map((layerId) => {
      const candidate = (stored as Record<string, unknown>)[layerId];
      return [
        layerId,
        typeof candidate === 'boolean' ? candidate : DEFAULT_SETTINGS.enabledLayers[layerId],
      ];
    }),
  ) as Record<LayerId, boolean>;
};

const readCohortCutoff = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) return DEFAULT_SETTINGS.cohortCutoff;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.cohortCutoff;
  const min = Date.parse(COHORT_CUTOFF_MIN_ISO);
  return new Date(Math.max(parsed, min)).toISOString().slice(0, 10);
};

const readNonNegativeNumber = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) && value >= 0 ? value : fallback;

const readCohortVolumes = (
  value: unknown,
): Pick<Settings, 'cohortVolumeFloor' | 'cohortVolumeCeiling'> => {
  const stored = typeof value === 'object' && value !== null ? value : {};
  const floor = readNonNegativeNumber(
    (stored as Record<string, unknown>).cohortVolumeFloor,
    DEFAULT_SETTINGS.cohortVolumeFloor,
  );
  const ceiling = Math.max(
    floor,
    readNonNegativeNumber(
      (stored as Record<string, unknown>).cohortVolumeCeiling,
      DEFAULT_SETTINGS.cohortVolumeCeiling,
    ),
  );
  return { cohortVolumeFloor: floor, cohortVolumeCeiling: ceiling };
};

export const repairSettings = (stored: unknown): Settings => {
  const value = typeof stored === 'object' && stored !== null ? stored : {};
  const record = value as Record<string, unknown>;
  return {
    hideThreshold: readThreshold(record.hideThreshold),
    hideAds: readHideAds(record.hideAds),
    weights: readWeights(migrateWeights(record.weights)),
    enabledLayers: readEnabledLayers(record.enabledLayers),
    cohortCutoff: readCohortCutoff(record.cohortCutoff),
    ...readCohortVolumes(record),
  };
};

// SF-214: stored weights that were never tuned migrate to the recalibrated defaults. Tuning is
// detected as any layer stored at a value that matches neither the legacy default nor the current
// default. Exact equality with LEGACY_DEFAULT_WEIGHTS was too strict: real pre-recalibration
// profiles could miss a layer (a SF-214-era store predates the repetition layer, and an options
// page save in any era can leave a layer unset), so an all-legacy-but-partial profile kept the
// stale low weights and a maximal behavioural signal could never cross the threshold.
const migrateWeights = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null) return value;
  const stored = value as Record<string, unknown>;
  const tuned = LAYER_IDS.some(
    (layerId) =>
      typeof stored[layerId] === 'number' &&
      stored[layerId] !== LEGACY_DEFAULT_WEIGHTS[layerId] &&
      stored[layerId] !== DEFAULT_SETTINGS.weights[layerId],
  );
  return tuned ? stored : DEFAULT_SETTINGS.weights;
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(null);
  return repairSettings(stored);
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(partial);
}

// Only keys that feed scoring re-trigger a rescore. Unrelated writes (onboardingShown, stats,
// corpus, author-activity caches) must not wake every open timeline.
const SCORING_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(DEFAULT_SETTINGS),
  'accountStates',
  'exclusions',
]);

export function onSettingsChanged(callback: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local') return;
    if (!Object.keys(changes).some((key) => SCORING_KEYS.has(key))) return;
    callback();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
