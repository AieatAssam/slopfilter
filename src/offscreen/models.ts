import {
  type DeviceType,
  env,
  type FeatureExtractionPipeline,
  type ImageClassificationPipeline,
  type ProgressCallback,
  type ProgressInfo,
  pipeline,
  type TextClassificationPipeline,
} from '@huggingface/transformers';

// Provisional HD-007 choices. Revisions are immutable Hub commits; licensing still needs owner sign-off.
export const MODEL_IDS = Object.freeze({
  embedder: Object.freeze({
    id: 'Xenova/all-MiniLM-L6-v2',
    revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  }),
  imageForensics: Object.freeze({
    id: 'onnx-community/CommunityForensics-DeepfakeDet-ViT-ONNX',
    revision: 'f9fc6516b37cd7d1bec3b94847b3682ce97249f0',
    dtype: 'q4f16',
  }),
});

export const OPTIONAL_MODEL_IDS = Object.freeze({
  textPattern: Object.freeze({
    id: 'trentmkelly/slop-detector-mini-2',
    revision: '30775d5640f1ac6524d6a469d02e531e37852360',
  }),
});

export const WEBGPU_ALLOWLIST: readonly string[] = Object.freeze([]);
export type InferenceBackend = 'wasm' | 'webgpu';
export type ModelKind = keyof typeof MODEL_IDS;
export type ModelProgress = (kind: ModelKind, progress: number) => void;
export type OptionalModelProgress = (
  kind: keyof typeof OPTIONAL_MODEL_IDS,
  progress: number,
) => void;

env.allowRemoteModels = true;
env.allowLocalModels = false;
env.useBrowserCache = true;
// Keep the loader as a normal extension module; blob: URLs are not allowed by the MV3 CSP.
env.useWasmCache = false;
env.remoteHost = 'https://huggingface.co';

const extensionRoot =
  typeof chrome !== 'undefined' && typeof chrome.runtime?.getURL === 'function'
    ? chrome.runtime.getURL('')
    : import.meta.url.startsWith('chrome-extension:')
      ? new URL('../', import.meta.url).href
      : null;

if (extensionRoot) {
  const wasm = env.backends.onnx?.wasm;
  if (wasm) {
    wasm.wasmPaths = {
      mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', extensionRoot).href,
      wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', extensionRoot).href,
    };
  }
}

export const selectBackend = (
  modelId: string,
  nav: { gpu?: unknown } = typeof navigator === 'undefined' ? {} : navigator,
): InferenceBackend =>
  nav.gpu !== undefined && WEBGPU_ALLOWLIST.includes(modelId) ? 'webgpu' : 'wasm';

const progressFor = <T extends string>(
  kind: T,
  onProgress?: (kind: T, progress: number) => void,
): ProgressCallback => {
  return (info: ProgressInfo) => {
    if (info.status === 'progress' || info.status === 'progress_total') {
      onProgress?.(kind, Math.max(0, Math.min(100, info.progress)));
    }
  };
};

export function loadPipeline(
  kind: 'embedder',
  backend: InferenceBackend,
  onProgress?: ModelProgress,
): Promise<FeatureExtractionPipeline>;
export function loadPipeline(
  kind: 'imageForensics',
  backend: InferenceBackend,
  onProgress?: ModelProgress,
): Promise<ImageClassificationPipeline>;
export async function loadPipeline(
  kind: ModelKind,
  backend: InferenceBackend,
  onProgress?: ModelProgress,
): Promise<FeatureExtractionPipeline | ImageClassificationPipeline> {
  const model = MODEL_IDS[kind];
  const options = {
    revision: model.revision,
    device: backend as DeviceType,
    dtype: ('dtype' in model ? model.dtype : 'q8') as 'q4f16' | 'q8',
    progress_callback: progressFor(kind, onProgress),
  };
  if (kind === 'embedder') return pipeline('feature-extraction', model.id, options);
  return pipeline('image-classification', model.id, options);
}

export const loadTextPatternPipeline = (
  backend: InferenceBackend,
  onProgress?: OptionalModelProgress,
): Promise<TextClassificationPipeline> =>
  pipeline('text-classification', OPTIONAL_MODEL_IDS.textPattern.id, {
    revision: OPTIONAL_MODEL_IDS.textPattern.revision,
    device: backend,
    dtype: 'q8',
    progress_callback: progressFor('textPattern', onProgress),
  });
