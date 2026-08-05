import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handleMessage } from '@/background/service-worker';

const action = {
  setBadgeBackgroundColor: vi.fn(),
  setBadgeText: vi.fn(),
  setTitle: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal('chrome', {
    action,
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
    },
  });
  vi.clearAllMocks();
});

describe('handleMessage', () => {
  test('sets a paused badge when a selftest-result reports failure', () => {
    handleMessage({
      type: 'selftest-result',
      ok: false,
      failedSelectorIds: ['timeline-container'],
    });

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!' });
    expect(action.setTitle).toHaveBeenCalledWith({
      title: expect.stringContaining('markup changed'),
    });
  });

  test('clears the badge when a selftest-result reports success', () => {
    handleMessage({ type: 'selftest-result', ok: true, failedSelectorIds: [] });

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(action.setTitle).toHaveBeenCalledWith({ title: 'SlopFilter' });
  });

  test('ignores a message that is not an ExtensionMessage', () => {
    handleMessage({ type: 'not-a-real-message' });

    expect(action.setBadgeText).not.toHaveBeenCalled();
    expect(action.setTitle).not.toHaveBeenCalled();
  });
});
