import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CONFIG_SCHEMA_VERSION, exportConfig, importConfig } from '@/storage/settingsIo';

const stored = {
  hideThreshold: 0.4,
  weights: { behavioural: 0.4 },
  enabledLayers: { behavioural: true },
  accountStates: { '@example': 'trusted' },
  exclusions: ['post-1'],
};

beforeEach(() => {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key?: string | string[]) => {
          if (key === 'exclusions') return { exclusions: stored.exclusions };
          if (key === 'accountStates') return { accountStates: stored.accountStates };
          return stored;
        }),
        set: vi.fn(async () => undefined),
      },
    },
  });
});

const containsForbiddenKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(
    ([key, child]) => ['vector', 'embedding', 'text'].includes(key) || containsForbiddenKey(child),
  );
};

describe('config export and import', () => {
  test('exports settings, accounts, exclusions, and schemaVersion', async () => {
    const result = await exportConfig();

    expect(result.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(result.settings.hideThreshold).toBe(0.4);
    expect(result.accounts).toEqual({ '@example': 'trusted' });
    expect(result.exclusions).toEqual(['post-1']);
  });

  test('never exports embeddings or post text', async () => {
    expect(containsForbiddenKey(await exportConfig())).toBe(false);
  });

  test('imports corrupt JSON as repaired defaults without throwing', async () => {
    await expect(
      importConfig(
        JSON.stringify({
          schemaVersion: CONFIG_SCHEMA_VERSION,
          settings: { hideThreshold: 'abc' },
        }),
      ),
    ).resolves.toEqual({ ok: true });
  });

  test('rejects an unknown schemaVersion with a message naming it', async () => {
    await expect(importConfig(JSON.stringify({ schemaVersion: 99 }))).resolves.toEqual({
      ok: false,
      message: expect.stringContaining('99'),
    });
  });

  test('round-trips a full config unchanged', async () => {
    const result = await exportConfig();
    expect(await importConfig(JSON.stringify(result))).toEqual({ ok: true });
  });
});
