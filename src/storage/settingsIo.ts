import { type AccountState, loadAccountStates } from '@/storage/accounts';
import { loadSettings, repairSettings, type Settings, saveSettings } from '@/storage/settings';

export const CONFIG_SCHEMA_VERSION = 1;

export interface ExportedConfig {
  schemaVersion: number;
  settings: Settings;
  accounts: Record<string, AccountState>;
  exclusions: readonly string[];
}

const validAccountState = (value: unknown): value is AccountState =>
  value === 'muted' || value === 'trusted' || value === 'images-only' || value === 'none';

export const exportConfig = async (): Promise<ExportedConfig> => {
  const stored = await chrome.storage.local.get('exclusions');
  const exclusions = Array.isArray(stored.exclusions)
    ? stored.exclusions.filter((value): value is string => typeof value === 'string')
    : [];
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    settings: await loadSettings(),
    accounts: await loadAccountStates(),
    exclusions,
  };
};

export const importConfig = async (
  raw: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Could not parse settings JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, message: 'Settings file must contain an object.' };
  }
  const value = parsed as Record<string, unknown>;
  if (value.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    return {
      ok: false,
      message: `Unsupported settings schema version: ${String(value.schemaVersion)}.`,
    };
  }

  const settings = repairSettings(value.settings);
  const accountsValue =
    typeof value.accounts === 'object' && value.accounts !== null ? value.accounts : {};
  const accounts = Object.fromEntries(
    Object.entries(accountsValue).filter(
      ([handle, state]) => handle.length > 0 && validAccountState(state),
    ),
  );
  const exclusions = Array.isArray(value.exclusions)
    ? value.exclusions.filter((entry): entry is string => typeof entry === 'string')
    : [];

  try {
    await saveSettings(settings);
    await chrome.storage.local.set({ accountStates: accounts, exclusions });
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not save imported settings.' };
  }
};
