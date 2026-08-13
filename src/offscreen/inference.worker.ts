import type {
  FeatureExtractionPipeline,
  ImageClassificationPipeline,
  TextClassificationPipeline,
} from '@huggingface/transformers';
import type { Post } from '@/core/post';
import type { SignalResult } from '@/core/scoring/types';
import { TEXT_PATTERN_DEFAULTS } from '@/core/scoring/weights';
import { CONTENT_TYPE_PROTOTYPES, scoreContentCentroid } from '@/core/signals/contentType';
import { MAX_IMAGES_PER_POST, scoreImageForensics } from '@/core/signals/imageForensics';
import { recomputeCentroids, scoreTaste } from '@/core/signals/taste';
import { scoreTextPattern, type TextPatternOutput } from '@/core/signals/textPattern';
import { addEmbedding, listEmbeddings, loadCentroids, saveCentroids } from '@/storage/embeddings';
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
let embedder: FeatureExtractionPipeline | null = null;
let imageForensicsModel: ImageClassificationPipeline | null = null;
let textPatternModel: TextClassificationPipeline | null = null;
let contentCentroids: Float32Array[] = [];
let tasteCentroids: Float32Array[] = [];
let loadPromise: Promise<void> | null = null;
let textPatternLoadPromise: Promise<void> | null = null;

const post = (message: WorkerResponse) => scope.postMessage(message);

const loadModels = async () => {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const { loadPipeline, MODEL_IDS, selectBackend } = await modelModule;
    embedder = await loadPipeline(
      'embedder',
      selectBackend(MODEL_IDS.embedder.id),
      (_kind, progress) => {
        post({ type: 'progress', progress: progress * 0.6 });
      },
    );
    contentCentroids = await Promise.all(
      CONTENT_TYPE_PROTOTYPES.map(async (prototype) => {
        const vectors = await Promise.all(prototype.examples.map(({ text }) => embed(text)));
        const centroid = new Float32Array(vectors[0]?.length ?? 0);
        for (const vector of vectors) {
          for (let index = 0; index < centroid.length; index += 1)
            centroid[index] = (centroid[index] ?? 0) + (vector[index] ?? 0);
        }
        const norm = Math.sqrt(centroid.reduce((sum, value) => sum + value * value, 0)) || 1;
        for (let index = 0; index < centroid.length; index += 1)
          centroid[index] = (centroid[index] ?? 0) / norm;
        return centroid;
      }),
    );
    imageForensicsModel = await loadPipeline(
      'imageForensics',
      selectBackend(MODEL_IDS.imageForensics.id),
      (_kind, progress) => {
        post({ type: 'progress', progress: 60 + progress * 0.4 });
      },
    );
    tasteCentroids = (await loadCentroids().catch(() => null)) ?? [];
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

const loadTextPattern = async (): Promise<void> => {
  if (textPatternModel) return;
  if (textPatternLoadPromise) return textPatternLoadPromise;
  textPatternLoadPromise = (async () => {
    const { loadTextPatternPipeline, selectBackend, OPTIONAL_MODEL_IDS } = await modelModule;
    textPatternModel = await loadTextPatternPipeline(
      selectBackend(OPTIONAL_MODEL_IDS.textPattern.id),
      (_kind, progress) => post({ type: 'progress', progress: 100 + progress }),
    );
  })().catch((error: unknown) => {
    textPatternLoadPromise = null;
    throw error;
  });
  return textPatternLoadPromise;
};

const classifyTextPattern = async (postData: Post): Promise<SignalResult> => {
  if (!textPatternModel) return scoreTextPattern(null, postData.text, TEXT_PATTERN_DEFAULTS);
  if (postData.text.length < TEXT_PATTERN_DEFAULTS.minChars)
    return scoreTextPattern(null, postData.text, TEXT_PATTERN_DEFAULTS);
  try {
    const raw = await textPatternModel(postData.text, { top_k: 2 });
    const outputs = Array.isArray(raw) ? raw : [raw];
    const values: TextPatternOutput = { human: 0, llm: 0 };
    for (const output of outputs) {
      if (output.label === 'human') values.human = output.score;
      if (output.label === 'llm') values.llm = output.score;
    }
    return scoreTextPattern(values, postData.text, TEXT_PATTERN_DEFAULTS);
  } catch {
    return scoreTextPattern(null, postData.text, TEXT_PATTERN_DEFAULTS);
  }
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
  tasteCentroids = recomputeCentroids(
    embeddings.map((record) => record.vector),
    1,
    0,
  );
  await saveCentroids(tasteCentroids);
};

const scorePost = async (postData: Post, textPatternEnabled: boolean) => {
  const signals: SignalResult[] = [];
  let embedding: number[] = [];
  try {
    const vector = await embed(postData.text);
    embedding = [...vector];
    signals.push(scoreContentCentroid(vector, contentCentroids));
    signals.push(scoreTaste(vector, tasteCentroids, 0.8));
  } catch {
    signals.push(scoreContentCentroid(null, contentCentroids));
    signals.push({ layerId: 'taste', ok: false, score: 0, reason: null });
  }
  if (textPatternEnabled) signals.push(await classifyTextPattern(postData));
  signals.push(await analyseImages(postData));
  return { postId: postData.id, signals, embedding };
};

scope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'load') {
    void loadModels().catch(() => undefined);
    return;
  }
  if (request.type === 'load-text-pattern') {
    void loadTextPattern().then(
      () => post({ type: 'text-pattern-ready', requestId: request.requestId }),
      () => post({ type: 'text-pattern-failed', requestId: request.requestId }),
    );
    return;
  }
  if (request.type === 'score-batch') {
    void (request.textPatternEnabled ? loadTextPattern().catch(() => undefined) : Promise.resolve())
      .then(() =>
        Promise.all(
          request.posts.map((postData) => scorePost(postData, request.textPatternEnabled === true)),
        ),
      )
      .then((results) =>
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
