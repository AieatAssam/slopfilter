import type { Post } from '@/core/post';
import type { ScoreBreakdown } from '@/core/scoring/types';

export type AccountState = 'muted' | 'trusted' | 'images-only' | 'none';
const STORAGE_KEY = 'accountStates';

const readStates = async (): Promise<Record<string, AccountState>> => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([handle, state]) =>
        handle.length > 0 &&
        (state === 'muted' || state === 'trusted' || state === 'images-only' || state === 'none'),
    ),
  ) as Record<string, AccountState>;
};

export const setAccountState = async (handle: string, state: AccountState): Promise<void> => {
  const key = handle.trim();
  if (!key) throw new Error('account handle is required');
  const states = await readStates();
  if (state === 'none') delete states[key];
  else states[key] = state;
  await chrome.storage.local.set({ [STORAGE_KEY]: states });
};

export const getAccountState = async (handle: string): Promise<AccountState> => {
  const states = await readStates();
  return states[handle.trim()] ?? 'none';
};

export const loadAccountStates = readStates;

export const applyAccountOverride = (
  post: Post,
  breakdown: ScoreBreakdown,
  state: AccountState,
): ScoreBreakdown => {
  if (state === 'trusted') return { ...breakdown, hidden: false, reasons: [] };
  if (state === 'muted') {
    return { ...breakdown, hidden: true, reasons: ['you muted this account'] };
  }
  if (state === 'images-only' && post.imageUrls.length === 0) {
    return { ...breakdown, hidden: false, reasons: [] };
  }
  return breakdown;
};
