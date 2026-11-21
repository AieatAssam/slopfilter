import { describe, expect, test, vi } from 'vitest';
import { createInferenceHost, type InferencePipelines } from '@/offscreen/offscreen';

const pipelines: InferencePipelines = {
  scoreBatch: async () => [],
  loadTextPattern: async () => true,
  embed: async () => null,
  downvote: async () => true,
};

describe('createInferenceHost model-ready announcements', () => {
  test('announces the base model once per loaded pipeline', async () => {
    const onModelReady = vi.fn();
    const host = createInferenceHost({ load: async () => pipelines, onModelReady });

    host.start();
    await vi.waitFor(() => expect(host.getStatus().state).toBe('ready'));
    host.start();

    expect(onModelReady).toHaveBeenCalledOnce();
    expect(onModelReady).toHaveBeenCalledWith('base', expect.any(String));
  });

  test('announces text-pattern once and gives each announcement a distinct epoch', async () => {
    const onModelReady = vi.fn();
    const host = createInferenceHost({ load: async () => pipelines, onModelReady });
    host.start();
    await vi.waitFor(() => expect(host.getStatus().state).toBe('ready'));

    await expect(host.loadTextPattern()).resolves.toBe(true);
    await expect(host.loadTextPattern()).resolves.toBe(true);

    const textPattern = onModelReady.mock.calls.filter(([model]) => model === 'text-pattern');
    expect(textPattern).toHaveLength(1);
    const epochs = onModelReady.mock.calls.map(([, epoch]) => epoch);
    expect(new Set(epochs).size).toBe(epochs.length);
  });
});
