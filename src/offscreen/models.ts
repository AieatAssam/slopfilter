import {
  type DeviceType,
  env,
  type FeatureExtractionPipeline,
  type ImageClassificationPipeline,
  type ProgressCallback,
  type ProgressInfo,
  pipeline,
  type ZeroShotClassificationPipeline,
} from '@huggingface/transformers';

// Provisional HD-007 choices. Revisions are immutable Hub commits; licensing still needs owner sign-off.
export const MODEL_IDS = Object.freeze({
  classifier: Object.freeze({
    id: 'Xenova/mobilebert-uncased-mnli',
    revision: '8b0ea66ab7b190bba77418ba03b67d69cfc9a1ee',
  }),
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

export const WEBGPU_ALLOWLIST: readonly string[] = Object.freeze([]);
export type InferenceBackend = 'wasm' | 'webgpu';
export type ModelKind = keyof typeof MODEL_IDS;
export type ModelProgress = (kind: ModelKind, progress: number) => void;

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

const progressFor = (kind: ModelKind, onProgress?: ModelProgress): ProgressCallback => {
  return (info: ProgressInfo) => {
    if (info.status === 'progress' || info.status === 'progress_total') {
      onProgress?.(kind, Math.max(0, Math.min(100, info.progress)));
    }
  };
};

export function loadPipeline(
  kind: 'classifier',
  backend: InferenceBackend,
  onProgress?: ModelProgress,
): Promise<ZeroShotClassificationPipeline>;
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
): Promise<
  ZeroShotClassificationPipeline | FeatureExtractionPipeline | ImageClassificationPipeline
> {
  const model = MODEL_IDS[kind];
  const options = {
    revision: model.revision,
    device: backend as DeviceType,
    dtype: ('dtype' in model ? model.dtype : 'q8') as 'q4f16' | 'q8',
    progress_callback: progressFor(kind, onProgress),
  };
  if (kind === 'classifier') {
    return pipeline('zero-shot-classification', model.id, options);
  }
  if (kind === 'embedder') return pipeline('feature-extraction', model.id, options);
  return pipeline('image-classification', model.id, options);
}
