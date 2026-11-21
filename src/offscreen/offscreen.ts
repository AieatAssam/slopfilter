import type { Post } from '@/core/post';
import type { SignalResult } from '@/core/scoring/types';
import { type ProvenanceResult, scoreProvenance } from '@/core/signals/provenance';
import { type ExtensionMessage, isExtensionMessage, type ModelStatus } from '@/shared/messages';
import { STALL_TIMEOUT_MS } from './download';
import type { WorkerRequest, WorkerResponse } from './protocol';

type C2paSdk = import('@contentauth/c2pa-web').C2paSdk;

let c2paPromise: Promise<C2paSdk> | null = null;
const getC2pa = () =>
  (c2paPromise ??= import('@contentauth/c2pa-web').then(({ createC2pa }) =>
    createC2pa({
      wasmSrc: chrome.runtime.getURL('offscreen/c2pa_bg.wasm'),
      workerSrc: new URL(chrome.runtime.getURL('offscreen/c2pa_worker.js')),
    }),
  ));

const emptyProvenance = (imageCount: number): ProvenanceResult => ({
  imageCount,
  withManifest: 0,
  withoutManifest: 0,
  unreadable: 0,
});

const unreadableProvenance = (imageCount: number): ProvenanceResult => ({
  ...emptyProvenance(imageCount),
  unreadable: imageCount,
});

// Provenance is best-effort: it must never hold a score batch past its deadline.
const PROVENANCE_DEADLINE_MS = 2_500;

const withinDeadline = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

const readProvenance = async (post: Post): Promise<ProvenanceResult> => {
  const urls = post.imageUrls;
  if (urls.length === 0) return emptyProvenance(0);
  let sdk: C2paSdk;
  try {
    sdk = await getC2pa();
  } catch {
    return unreadableProvenance(urls.length);
  }
  const result = emptyProvenance(urls.length);
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        cache: 'force-cache',
        signal: AbortSignal.timeout(PROVENANCE_DEADLINE_MS),
      });
      if (!response.ok) throw new Error(`image request failed: ${response.status}`);
      const blob = await response.blob();
      const format = response.headers.get('content-type')?.split(';', 1)[0] || blob.type;
      if (!format) throw new Error('image format unavailable');
      const reader = await sdk.reader.fromBlob(format, blob);
      if (!reader) {
        result.withoutManifest += 1;
        continue;
      }
      try {
        await reader.activeManifest();
        result.withManifest += 1;
      } finally {
        await reader.free();
      }
    } catch {
      result.unreadable += 1;
    }
  }
  return result;
};

export interface InferencePipelines {
  scoreBatch: (
    posts: readonly Post[],
    textPatternEnabled?: boolean,
  ) => Promise<
    readonly { postId: string; signals: readonly SignalResult[]; embedding: readonly number[] }[]
  >;
  loadTextPattern?: () => Promise<boolean>;
  embed: (text: string) => Promise<Float32Array | null>;
  downvote: (postId: string, text: string) => Promise<boolean>;
}

export interface InferenceHostOptions {
  load: (onProgress: (progress: number) => void) => Promise<InferencePipelines>;
  onStatus?: (status: ModelStatus) => void;
  onModelReady?: (model: 'base' | 'text-pattern', epoch: string) => void;
}

let simulateModelFailure = false;

export interface InferenceHost {
  start: () => void;
  retry: () => void;
  getStatus: () => ModelStatus;
  scoreBatch: (
    posts: readonly Post[],
    textPatternEnabled?: boolean,
  ) => Promise<
    readonly { postId: string; signals: readonly SignalResult[]; embedding: readonly number[] }[]
  >;
  loadTextPattern: () => Promise<boolean>;
  embed: (text: string) => Promise<Float32Array | null>;
  downvote: (postId: string, text: string) => Promise<boolean>;
}

export // Test-build-only: a deterministic unit vector derived from post text, so SF-219's corpus feeding and
// cosine path run end to end without downloading a model. Identical text produces an identical vector
// (cosine 1.0); distinct text produces near-orthogonal vectors (cosine ~0).
const fixtureEmbedding = (text: string): number[] => {
  const dim = 128;
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash ^ BigInt(text.charCodeAt(index))) * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  const raw: number[] = [];
  for (let dimension = 0; dimension < dim; dimension += 1) {
    hash = ((hash ^ 0x9e3779b97f4a7c15n) * 0x100000001b3n) & 0xffffffffffffffffn;
    const unit = Number(hash % 1000000000n) / 1000000000;
    raw.push(unit * 2 - 1);
  }
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0)) || 1;
  return raw.map((value) => value / norm);
};

const fixtureScoreBatchResponse = (posts: readonly Post[], textPatternMax = false) =>
  posts.map((post) => ({
    postId: post.id,
    signals: textPatternMax
      ? [
          {
            layerId: 'text-pattern' as const,
            ok: true,
            score: 1,
            reason: null,
            detail: {
              status: 'scored' as const,
              values: { human: 0, llm: 1, characterCount: post.text.length },
            },
          },
        ]
      : [],
    embedding: fixtureEmbedding(post.text),
  }));

export const createInferenceHost = ({
  load,
  onStatus,
  onModelReady,
}: InferenceHostOptions): InferenceHost => {
  let status: ModelStatus = { state: 'idle', progress: 0, error: null };
  let pipelines: InferencePipelines | null = null;
  let loading: Promise<void> | null = null;
  let attempt = 0;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  // Epochs are unique per announcement so content can tell a fresh model from one it already saw.
  const instanceId = Date.now().toString(36);
  let announcements = 0;
  let textPatternAnnounced = false;

  const publish = (next: ModelStatus) => {
    status = next;
    onStatus?.(next);
  };

  const announce = (model: 'base' | 'text-pattern') => {
    announcements += 1;
    onModelReady?.(model, `${instanceId}:${announcements}`);
  };

  const clearStallTimer = () => {
    if (stallTimer === null) return;
    clearTimeout(stallTimer);
    stallTimer = null;
  };

  const start = () => {
    if (loading || pipelines || status.state === 'failed') return;
    const currentAttempt = ++attempt;
    let lastProgress = Date.now();
    publish({ state: 'downloading', progress: 0, error: null });
    loading = load((progress) => {
      if (currentAttempt !== attempt) return;
      lastProgress = Date.now();
      publish({
        state: 'downloading',
        progress: Math.max(0, Math.min(100, progress)),
        error: null,
      });
    })
      .then((nextPipelines) => {
        if (currentAttempt !== attempt || status.state !== 'downloading') return;
        pipelines = nextPipelines;
        textPatternAnnounced = false;
        publish({ state: 'ready', progress: 100, error: null });
        announce('base');
      })
      .catch((error: unknown) => {
        if (currentAttempt !== attempt) return;
        const message = error instanceof Error ? error.message : 'model load failed';
        publish({ state: 'failed', progress: 0, error: message });
      })
      .finally(() => {
        if (currentAttempt !== attempt) return;
        loading = null;
        clearStallTimer();
      });
    const checkForStall = () => {
      if (currentAttempt !== attempt || status.state !== 'downloading') return;
      if (Date.now() - lastProgress >= STALL_TIMEOUT_MS) {
        loading = null;
        publish({ state: 'failed', progress: status.progress, error: 'model download stalled' });
        return;
      }
      stallTimer = setTimeout(checkForStall, STALL_TIMEOUT_MS);
    };
    stallTimer = setTimeout(checkForStall, STALL_TIMEOUT_MS);
  };

  const retry = () => {
    if (status.state !== 'failed') return;
    attempt += 1;
    clearStallTimer();
    pipelines = null;
    publish({ state: 'idle', progress: 0, error: null });
    start();
  };

  return {
    start,
    retry,
    getStatus: () => status,
    async scoreBatch(posts, textPatternEnabled) {
      start();
      if (!pipelines && loading) await loading.catch(() => undefined);
      if (!pipelines) return [];
      try {
        return await pipelines.scoreBatch(posts, textPatternEnabled);
      } catch {
        return [];
      }
    },
    async loadTextPattern() {
      start();
      if (!pipelines && loading) await loading.catch(() => undefined);
      if (!pipelines?.loadTextPattern) return false;
      const ok = await pipelines.loadTextPattern();
      if (ok && !textPatternAnnounced) {
        textPatternAnnounced = true;
        announce('text-pattern');
      }
      return ok;
    },
    async embed(text) {
      start();
      if (!pipelines) return null;
      try {
        return await pipelines.embed(text);
      } catch {
        return null;
      }
    },
    async downvote(postId, text) {
      start();
      if (!pipelines && loading) await loading.catch(() => undefined);
      if (!pipelines) return false;
      try {
        return await pipelines.downvote(postId, text);
      } catch {
        return false;
      }
    },
  };
};

// Deadlines per request kind. A score batch must come back quickly or fail open; the others get
// longer budgets because a cold embed or a text-pattern model download can legitimately take longer.
const SCORE_DEADLINE_MS = 10_000;
const EMBED_DEADLINE_MS = 10_000;
const TEXT_PATTERN_DEADLINE_MS = 90_000;

type WorkerReply = Extract<WorkerResponse, { requestId: string }>;

const createWorkerPipelines = (
  onProgress: (progress: number) => void,
): Promise<InferencePipelines> => {
  const worker = new Worker(chrome.runtime.getURL('offscreen/inference.worker.js'), {
    type: 'module',
  });
  const pending = new Map<
    string,
    { resolve: (reply: WorkerReply | null) => void; timer: ReturnType<typeof setTimeout> }
  >();
  let sequence = 0;
  let resolveReady: (() => void) | undefined;
  let rejectReady: ((error: Error) => void) | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  // The single settlement path: clear the deadline and remove the entry before resolving, so a late
  // or duplicate reply is a no-op and no promise is left dangling.
  const settle = (requestId: string, reply: WorkerReply | null) => {
    const entry = pending.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(requestId);
    entry.resolve(reply);
  };
  const settleAll = () => {
    for (const requestId of [...pending.keys()]) settle(requestId, null);
  };

  const request = (
    requestId: string,
    message: WorkerRequest,
    deadlineMs: number,
  ): Promise<WorkerReply | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => settle(requestId, null), deadlineMs);
      pending.set(requestId, { resolve, timer });
      worker.postMessage(message);
    });

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === 'progress') {
      onProgress(message.progress);
      return;
    }
    if (message.type === 'ready') {
      resolveReady?.();
      return;
    }
    if (message.type === 'failed') {
      rejectReady?.(new Error(message.error));
      return;
    }
    if ('requestId' in message) settle(message.requestId, message);
  });
  // A dead or unreadable worker must not leave callers waiting: reject a pending load and settle
  // every in-flight request as empty so the content script fails open.
  worker.addEventListener('error', (event) => {
    rejectReady?.(new Error(event.message || 'inference worker failed'));
    settleAll();
  });
  worker.addEventListener('messageerror', () => {
    rejectReady?.(new Error('inference worker message could not be read'));
    settleAll();
  });
  worker.postMessage({ type: 'load' } satisfies WorkerRequest);

  return ready.then(() => ({
    scoreBatch: async (posts, textPatternEnabled = false) => {
      const requestId = `batch-${sequence++}`;
      // Provenance runs alongside the worker request, so its bounded wait does not add to the total.
      const provenancePromise = Promise.all(
        posts.map((post) =>
          withinDeadline(
            readProvenance(post),
            PROVENANCE_DEADLINE_MS,
            unreadableProvenance(post.imageUrls.length),
          ),
        ),
      );
      const reply = await request(
        requestId,
        {
          type: 'score-batch',
          requestId,
          posts,
          ...(textPatternEnabled ? { textPatternEnabled: true } : {}),
        },
        SCORE_DEADLINE_MS,
      );
      const provenance = await provenancePromise;
      if (reply?.type !== 'score-batch-response') return [];
      const byId = new Map(posts.map((post, index) => [post.id, provenance[index]]));
      return reply.results.map((result) => ({
        ...result,
        signals: [
          ...result.signals,
          scoreProvenance(byId.get(result.postId) ?? emptyProvenance(0)),
        ],
      }));
    },
    loadTextPattern: async () => {
      const requestId = `text-pattern-${sequence++}`;
      const reply = await request(
        requestId,
        { type: 'load-text-pattern', requestId },
        TEXT_PATTERN_DEADLINE_MS,
      );
      return reply?.type === 'text-pattern-ready';
    },
    embed: async (text) => {
      const requestId = `embed-${sequence++}`;
      const reply = await request(requestId, { type: 'embed', requestId, text }, EMBED_DEADLINE_MS);
      return reply?.type === 'embed-response' ? Float32Array.from(reply.vector) : null;
    },
    downvote: async (postId, text) => {
      const requestId = `downvote-${sequence++}`;
      const reply = await request(
        requestId,
        { type: 'downvote', requestId, postId, text },
        EMBED_DEADLINE_MS,
      );
      return reply?.type === 'downvote-response' && reply.ok;
    },
  }));
};

const host = createInferenceHost({
  load: async (onProgress) => {
    if (__SLOPFILTER_TEST_BUILD__ && simulateModelFailure) {
      throw new Error('model host unavailable');
    }
    return createWorkerPipelines(onProgress);
  },
  onStatus: (status) => {
    if (typeof chrome === 'undefined') return;
    void chrome.runtime.sendMessage({ type: 'model-status', status }).catch(() => undefined);
  },
  onModelReady: (model, epoch) => {
    if (typeof chrome === 'undefined') return;
    void chrome.runtime.sendMessage({ type: 'model-ready', model, epoch }).catch(() => undefined);
  },
});

const handleRuntimeMessage = (
  message: ExtensionMessage,
  sendResponse: (response: ExtensionMessage) => void,
): boolean => {
  if (message.type === 'score-batch-request') {
    if (__SLOPFILTER_TEST_BUILD__) simulateModelFailure = message.simulateModelFailure === true;
    if (
      __SLOPFILTER_TEST_BUILD__ &&
      (message.fixtureEmbeddings === true || message.fixtureTextPatternMax === true)
    ) {
      sendResponse({
        type: 'score-batch-response',
        requestId: message.requestId,
        results: fixtureScoreBatchResponse(message.posts, message.fixtureTextPatternMax === true),
      });
      return true;
    }
    void host
      .scoreBatch(message.posts, message.textPatternEnabled)
      .then((results) =>
        sendResponse({ type: 'score-batch-response', requestId: message.requestId, results }),
      );
    return true;
  }
  if (message.type === 'text-pattern-download') {
    void host
      .loadTextPattern()
      .then((ok) => sendResponse({ type: 'text-pattern-download-complete', ok }));
    return true;
  }
  if (message.type === 'embed-request') {
    void host.embed(message.text).then((vector) =>
      sendResponse({
        type: 'embed-response',
        requestId: message.requestId,
        vector: vector ? [...vector] : null,
      }),
    );
    return true;
  }
  if (message.type === 'downvote-post') {
    void host
      .downvote(message.postId, message.text)
      .then((ok) => sendResponse({ type: 'downvote-complete', postId: message.postId, ok }));
    return true;
  }
  if (message.type === 'model-status-request') {
    host.start();
    sendResponse({ type: 'model-status', status: host.getStatus() });
    return true;
  }
  if (message.type === 'model-retry') {
    host.retry();
    sendResponse({ type: 'model-status', status: host.getStatus() });
    return true;
  }
  return false;
};

if (typeof chrome !== 'undefined') {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isExtensionMessage(message)) return false;
    // runtime.sendMessage broadcasts to every extension context, so the content script and the
    // popup would reach this host directly and bypass the service worker's offscreen-ready gate.
    // Accept only service-worker forwards; that single serialized path lets the worker apply
    // simulateModelFailure before any model-status-request can start a real load.
    if (sender.url && !sender.url.endsWith('background/service-worker.js')) return false;
    return handleRuntimeMessage(message, sendResponse);
  });
  // The listener above is the offscreen's only inbound path. Announce readiness only after it is
  // registered, so the service worker never forwards an inference request into a dead listener.
  void chrome.runtime.sendMessage({ type: 'offscreen-ready' }).catch(() => undefined);
}
