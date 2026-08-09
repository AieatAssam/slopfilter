import type {
  FeatureExtractionPipeline,
  ImageClassificationPipeline,
  ZeroShotClassificationPipeline,
} from '@huggingface/transformers';
import type { Post } from '@/core/post';
import type { SignalResult } from '@/core/scoring/types';
import {
  CONTENT_TYPE_LABELS,
  scoreContentType,
  shouldClassifyContent,
} from '@/core/signals/contentType';
import { MAX_IMAGES_PER_POST, scoreImageForensics } from '@/core/signals/imageForensics';
import { recomputeCentroids, scoreTaste } from '@/core/signals/taste';
import { addEmbedding, listEmbeddings, loadCentroids, saveCentroids } from '@/storage/embeddings';
import type { InferenceBackend } from './models';
import type { WorkerRequest, WorkerResponse } from './protocol';

// Transformers.js 4.2's WASM loader still reads window during module initialisation.
// Dedicated workers have no window, so provide the worker global before the dynamic import.
if (typeof window === 'undefined')
  Object.defineProperty(globalThis, 'window', { value: globalThis });
const hadDocument = 'document' in globalThis;
if (!hadDocument) {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        addEventListener: () => undefined,
        setAttribute: () => undefined,
      }),
      getElementsByTagName: () => [],
      head: { appendChild: () => undefined },
      querySelector: () => null,
    },
  });
}
const modelModule = import('./models').finally(() => {
  if (!hadDocument) delete (globalThis as { document?: unknown }).document;
});

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

const scope = globalThis as unknown as WorkerScope;
let classifier: ZeroShotClassificationPipeline | null = null;
let embedder: FeatureExtractionPipeline | null = null;
let imageForensicsModel: ImageClassificationPipeline | null = null;
let centroids: Float32Array[] = [];
let loadPromise: Promise<void> | null = null;

const post = (message: WorkerResponse) => scope.postMessage(message);

const loadModels = async () => {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const { loadPipeline, MODEL_IDS, selectBackend } = await modelModule;
    const backend: InferenceBackend = selectBackend(
      MODEL_IDS.classifier.id,
      typeof navigator === 'undefined' ? {} : navigator,
    );
    classifier = await loadPipeline('classifier', backend, (_kind, progress) => {
      post({ type: 'progress', progress: progress * 0.35 });
    });
    embedder = await loadPipeline(
      'embedder',
      selectBackend(MODEL_IDS.embedder.id),
      (_kind, progress) => {
        post({ type: 'progress', progress: 35 + progress * 0.25 });
      },
    );
    imageForensicsModel = await loadPipeline(
      'imageForensics',
      selectBackend(MODEL_IDS.imageForensics.id),
      (_kind, progress) => {
        post({ type: 'progress', progress: 60 + progress * 0.4 });
      },
    );
    centroids = (await loadCentroids().catch(() => null)) ?? [];
    post({ type: 'progress', progress: 100 });
    post({ type: 'ready' });
  })().catch((error: unknown) => {
    loadPromise = null;
    post({ type: 'failed', error: error instanceof Error ? error.message : 'model load failed' });
    throw error;
  });
  return loadPromise;
};

const analyseImages = async (postData: Post) => {
  if (postData.imageUrls.length === 0) return scoreImageForensics({ ok: true, scores: [] });
  if (!imageForensicsModel) return scoreImageForensics({ ok: false, scores: [] });
  try {
    const scores: number[] = [];
    for (const imageUrl of postData.imageUrls.slice(0, MAX_IMAGES_PER_POST)) {
      const output = await imageForensicsModel(imageUrl, { top_k: 1 });
      const score = output[0]?.score;
      if (typeof score !== 'number' || !Number.isFinite(score))
        throw new Error('invalid image score');
      scores.push(score);
    }
    return scoreImageForensics({ ok: true, scores });
  } catch {
    return scoreImageForensics({ ok: false, scores: [] });
  }
};

const classify = async (postData: Post) => {
  if (!classifier) return scoreContentType({ labels: [], scores: [] }, { unavailable: true });
  if (!shouldClassifyContent(postData.text)) {
    return scoreContentType({ labels: [], scores: [] }, { gated: true });
  }
  const output = await classifier(postData.text, [...CONTENT_TYPE_LABELS]);
  return scoreContentType(output);
};

const embed = async (text: string): Promise<Float32Array> => {
  if (!embedder) throw new Error('embedder is not ready');
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Float32Array.from(output.data as ArrayLike<number>);
};

const recordDownvote = async (postId: string, text: string): Promise<void> => {
  const vector = await embed(text);
  await addEmbedding({ postId, vector, createdAt: Date.now() });
  const embeddings = await listEmbeddings();
  // ponytail: one centroid keeps feedback cheap and deterministic; split clusters only when real
  // feedback volume proves that a more complex taste model improves results.
  centroids = recomputeCentroids(
    embeddings.map((record) => record.vector),
    1,
    0,
  );
  await saveCentroids(centroids);
};

const scorePost = async (postData: Post) => {
  const signals: SignalResult[] = [await classify(postData)];
  try {
    const vector = await embed(postData.text);
    signals.push(scoreTaste(vector, centroids, 0.8));
  } catch {
    signals.push({ layerId: 'taste', ok: false, score: 0, reason: null });
  }
  signals.push(await analyseImages(postData));
  return { postId: postData.id, signals };
};

scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'load') {
    void loadModels().catch(() => undefined);
    return;
  }
  if (request.type === 'score-batch') {
    void Promise.all(request.posts.map(scorePost)).then((results) =>
      post({ type: 'score-batch-response', requestId: request.requestId, results }),
    );
    return;
  }
  if (request.type === 'embed') {
    void embed(request.text).then(
      (vector) =>
        post({ type: 'embed-response', requestId: request.requestId, vector: [...vector] }),
      () => post({ type: 'embed-response', requestId: request.requestId, vector: [] }),
    );
    return;
  }
  if (request.type === 'downvote') {
    void recordDownvote(request.postId, request.text).then(
      () =>
        post({
          type: 'downvote-response',
          requestId: request.requestId,
          postId: request.postId,
          ok: true,
        }),
      () =>
        post({
          type: 'downvote-response',
          requestId: request.requestId,
          postId: request.postId,
          ok: false,
        }),
    );
  }
};
