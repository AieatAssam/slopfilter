import { describe, expect, test } from 'vitest';
import { MODEL_IDS, selectBackend } from '@/offscreen/models';

describe('inference backend selection', () => {
  test('defaults to WASM without WebGPU', () => {
    expect(selectBackend(MODEL_IDS.classifier.id, {})).toBe('wasm');
  });

  test('keeps WASM when WebGPU is not allowlisted', () => {
    expect(selectBackend(MODEL_IDS.embedder.id, { gpu: {} })).toBe('wasm');
  });

  test('never selects WebGPU for an unknown model', () => {
    expect(selectBackend('unknown/model', { gpu: {} })).toBe('wasm');
  });

  test('uses the approved compact image-forensics model', () => {
    expect(MODEL_IDS.imageForensics).toEqual({
      id: 'onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX',
      revision: 'f9fc6516b37cd7d1bec3b94847b3682ce97249f0',
      dtype: 'q4f16',
    });
  });
});
