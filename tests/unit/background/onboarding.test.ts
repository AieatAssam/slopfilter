import { beforeEach, describe, expect, test, vi } from 'vitest';
import { maybeOpenOnboarding } from '@/background/onboarding';

describe('onboarding', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ onboardingShown: false })),
          set: vi.fn(async () => undefined),
        },
      },
      runtime: { getURL: vi.fn((path: string) => `chrome-extension://test/${path}`) },
      tabs: { create: vi.fn(async () => undefined) },
    });
  });

  test('opens the onboarding page on first run', async () => {
    await maybeOpenOnboarding();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/ui/onboarding/onboarding.html',
    });
  });

  test('does not open on a subsequent run', async () => {
    let shown = false;
    const local = {
      get: vi.fn(async () => ({ onboardingShown: shown })),
      set: vi.fn(async () => {
        shown = true;
      }),
    };
    vi.stubGlobal('chrome', {
      storage: { local },
      runtime: { getURL: vi.fn((path: string) => path) },
      tabs: { create: vi.fn(async () => undefined) },
    });

    await maybeOpenOnboarding();
    await maybeOpenOnboarding();

    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  });

  test('records the flag before opening', async () => {
    const order: string[] = [];
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ onboardingShown: false })),
          set: vi.fn(async () => order.push('set')),
        },
      },
      runtime: { getURL: vi.fn(() => 'onboarding') },
      tabs: { create: vi.fn(async () => order.push('create')) },
    });

    await maybeOpenOnboarding();

    expect(order).toEqual(['set', 'create']);
  });
});
