import type { LayerId } from '@/core/scoring/types';
import { DEFAULT_SCORING_CONFIG } from '@/core/scoring/weights';

export const THRESHOLD_MIN = 0;
export const THRESHOLD_MAX = 1;

export const LAYER_IDS: readonly LayerId[] = [
  'behavioural',
  'provenance',
  'content-type',
  'image-forensics',
  'taste',
];

export interface Settings {
  hideThreshold: number;
  weights: Record<LayerId, number>;
  enabledLayers: Record<LayerId, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  hideThreshold: DEFAULT_SCORING_CONFIG.hideThreshold,
  weights: { ...DEFAULT_SCORING_CONFIG.weights },
  enabledLayers: Object.fromEntries(LAYER_IDS.map((layerId) => [layerId, true])) as Record<
    LayerId,
    boolean
  >,
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const readThreshold = (value: unknown): number => {
  if (!isFiniteNumber(value)) return DEFAULT_SETTINGS.hideThreshold;
  return Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, value));
};

const readWeights = (value: unknown): Record<LayerId, number> => {
  const stored = typeof value === 'object' && value !== null ? value : {};
  return Object.fromEntries(
    LAYER_IDS.map((layerId) => {
      const candidate = (stored as Record<string, unknown>)[layerId];
      return [
        layerId,
        isFiniteNumber(candidate) && candidate >= 0 && candidate <= 1
          ? candidate
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

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(null);
  return {
    hideThreshold: readThreshold(stored.hideThreshold),
    weights: readWeights(stored.weights),
    enabledLayers: readEnabledLayers(stored.enabledLayers),
  };
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(partial);
}

export function onSettingsChanged(callback: () => void): () => void {
  const listener = (_changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'local') callback();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
