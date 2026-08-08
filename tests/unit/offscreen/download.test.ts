import { describe, expect, test, vi } from 'vitest';
import { createDownloadTracker, STALL_TIMEOUT_MS } from '@/offscreen/download';

describe('download tracker', () => {
  test('transitions idle to downloading to ready on progress then completion', async () => {
    let clock = 0;
    let finish: (() => void) | undefined;
    const tracker = createDownloadTracker({
      now: () => clock,
      load: async (onProgress) => {
        onProgress(50, 100);
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    });

    expect(tracker.getState()).toBe('idle');
    tracker.start();
    expect(tracker.getState()).toBe('downloading');
    expect(tracker.getPercent()).toBe(50);
    finish?.();
    await vi.waitFor(() => expect(tracker.getState()).toBe('ready'));
    clock += 1;
  });

  test('reports a percentage derived from bytes received over bytes total', () => {
    const tracker = createDownloadTracker({
      now: () => 0,
      load: async (onProgress) => onProgress(25, 200),
    });

    tracker.start();
    expect(tracker.getPercent()).toBe(12.5);
  });

  test('transitions to failed when no progress arrives within the stall timeout', () => {
    let clock = 0;
    const tracker = createDownloadTracker({
      now: () => clock,
      load: async () => new Promise(() => undefined),
    });

    tracker.start();
    clock = STALL_TIMEOUT_MS + 1;
    expect(tracker.getState()).toBe('failed');
  });

  test('never retries automatically', () => {
    let clock = 0;
    const load = vi.fn(async () => new Promise<void>(() => undefined));
    const tracker = createDownloadTracker({ now: () => clock, load });

    tracker.start();
    clock = STALL_TIMEOUT_MS * 10;
    expect(tracker.getState()).toBe('failed');
    expect(load).toHaveBeenCalledTimes(1);
  });

  test('retry moves failed back to downloading and calls load again', () => {
    let clock = 0;
    const load = vi.fn(async () => new Promise<void>(() => undefined));
    const tracker = createDownloadTracker({ now: () => clock, load });

    tracker.start();
    clock = STALL_TIMEOUT_MS + 1;
    expect(tracker.getState()).toBe('failed');
    tracker.retry();
    expect(tracker.getState()).toBe('downloading');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
