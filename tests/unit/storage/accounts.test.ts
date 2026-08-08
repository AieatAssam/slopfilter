import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Post } from '@/core/post';
import type { ScoreBreakdown } from '@/core/scoring/types';
import {
  type AccountState,
  applyAccountOverride,
  getAccountState,
  setAccountState,
} from '@/storage/accounts';

const post = (imageUrls: readonly string[] = []): Post => ({
  id: 'post-1',
  permalink: null,
  text: 'post',
  postedAt: null,
  author: { handle: '@handle', displayName: 'Original name', profileUrl: null },
  engagement: { replies: 0, reposts: 0, likes: 0, views: 0 },
  imageUrls,
  hasVideo: false,
});

const breakdown: ScoreBreakdown = {
  compositeScore: 0.9,
  threshold: 0.6,
  hidden: true,
  contributions: [
    { layerId: 'behavioural', score: 1, weight: 1, weighted: 1, reason: 'frequency' },
  ],
  reasons: ['frequency'],
};

beforeEach(() => {
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: {} })),
        set: vi.fn(async () => undefined),
      },
    },
  });
});

describe('account overrides', () => {
  test('trust overrides every signal including vetoes', () => {
    expect(applyAccountOverride(post(), breakdown, 'trusted').hidden).toBe(false);
  });

  test('mute collapses regardless of score', () => {
    const result = applyAccountOverride(post(), { ...breakdown, hidden: false }, 'muted');

    expect(result.hidden).toBe(true);
    expect(result.reasons).toEqual(['you muted this account']);
  });

  test('setting trust clears mute and setting mute clears trust', async () => {
    const states = new Map<string, Record<string, AccountState>>();
    const local = {
      get: vi.fn(async (key: string) => ({ [key]: states.get(key) ?? {} })),
      set: vi.fn(async (value: Record<string, Record<string, AccountState>>) => {
        for (const [key, state] of Object.entries(value)) states.set(key, state);
      }),
    };
    vi.stubGlobal('chrome', { storage: { local } });

    await setAccountState('@handle', 'muted');
    await setAccountState('@handle', 'trusted');
    expect(await getAccountState('@handle')).toBe('trusted');
    await setAccountState('@handle', 'muted');
    expect(await getAccountState('@handle')).toBe('muted');
  });

  test('state is keyed by handle, so display-name changes do not matter', async () => {
    const state = { accountStates: { '@handle': 'trusted' as AccountState } };
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => state), set: vi.fn() } },
    });

    expect(await getAccountState(post().author.handle)).toBe('trusted');
    expect(post().author.displayName).toBe('Original name');
  });

  test('images-only leaves a text-only post unfiltered', () => {
    expect(applyAccountOverride(post(), breakdown, 'images-only').hidden).toBe(false);
    expect(applyAccountOverride(post(['/thumb.jpg']), breakdown, 'images-only').hidden).toBe(true);
  });
});
