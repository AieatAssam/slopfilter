import { describe, expect, test } from 'vitest';
import { MODEL_IDS, OPTIONAL_MODEL_IDS, selectBackend } from '@/offscreen/models';

describe('inference backend selection', () => {
  test('keeps the first-run model set to embedder and image forensics', () => {
    expect(Object.keys(MODEL_IDS)).toEqual(['embedder', 'imageForensics']);
  });

  test('defaults to WASM without WebGPU', () => {
    expect(selectBackend(MODEL_IDS.embedder.id, {})).toBe('wasm');
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

  test('keeps the optional text-pattern model out of the first-run set', () => {
    expect(OPTIONAL_MODEL_IDS.textPattern).toEqual({
      id: 'trentmkelly/slop-detector-mini-2',
      revision: '30775d5640f1ac6524d6a469d02e531e37852360',
    });
    expect(Object.values(MODEL_IDS)).not.toContain(OPTIONAL_MODEL_IDS.textPattern);
  });
});
