// SF-216: MAIN-world timeline observer. Runs at document_start so it wraps the page's own
// fetch and XMLHttpRequest before X captures those references. Reads the response X already made
// and forwards only derived numbers back to the isolated-world content script. Forwards nothing on
// a match failure and never starts a request of its own.
import {
  extractPayload,
  operationForUrl,
  type PayloadRelayMessage,
  payloadContract,
  payloadOperations,
  payloadRelayFromExtract,
} from '@/adapters/x/payload';

const decoder = new TextDecoder();

const absoluteUrl = (candidate: string): string => {
  if (!candidate) return '';
  try {
    return new URL(candidate, window.location.href).href;
  } catch {
    return '';
  }
};

const fwd = (message: PayloadRelayMessage) => {
  try {
    window.postMessage(message, window.location.origin);
  } catch {
    // A hostile page must be able to block the relay without breaking the timeline.
  }
};

const acceptBody = (text: string, operation: string) => {
  try {
    const parsed = JSON.parse(text) as unknown;
    const extract = extractPayload(parsed, payloadContract);
    if (extract.authors.length === 0 && Object.values(extract.engagement).length === 0) return;
    fwd(payloadRelayFromExtract(operation, extract));
  } catch {
    // A malformed body is no-data, never an error for filtering.
  }
};

const acceptJson = (value: string): string | null => {
  try {
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
};

const observeFetch = (result: Promise<Response>, url: string) => {
  const candidate = absoluteUrl(url);
  const operation = operationForUrl(candidate, payloadOperations);
  if (!operation) return;
  result.then(
    (response) => {
      try {
        const clone = response.clone();
        void clone
          .text()
          .then((text) => {
            const body = acceptJson(text);
            if (body) acceptBody(body, operation);
          })
          .catch(() => undefined);
      } catch {
        // Non-cloneable responses are skipped, not fatal.
      }
    },
    () => undefined,
  );
};

// Saved first-class references: stubbing that calls a foreign method through a captured name
// keeps the observer from recursing through its own wrapper.
const rawFetch = window.fetch.bind(window);
window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
  let candidate = '';
  if (typeof input === 'string') candidate = input;
  else if (input instanceof URL) candidate = input.href;
  else if (input && typeof input === 'object' && 'url' in input) {
    const urlValue = (input as { url?: unknown }).url;
    candidate = typeof urlValue === 'string' ? urlValue : '';
  }
  const result = rawFetch.call(this, input as Parameters<typeof rawFetch>[0], init);
  observeFetch(result, candidate);
  return result;
};

const rawOpen = XMLHttpRequest.prototype.open;
const rawSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (
  method: string,
  url: string | URL,
  async?: boolean,
  user?: string | null,
  password?: string | null,
) {
  // @ts-expect-error runtime extension of the request object (main world observers only)
  this.__sf_payload_url = typeof url === 'string' ? url : url instanceof URL ? url.href : '';
  return rawOpen.call(this, method, url, async ?? true, user ?? null, password ?? null);
};

XMLHttpRequest.prototype.send = function (
  this: XMLHttpRequest,
  body?: Document | XMLHttpRequestBodyInit | null,
) {
  // @ts-expect-error runtime extension of the request object (main world observers only)
  const observedUrl: string = absoluteUrl(this.__sf_payload_url ?? '');
  const operation = operationForUrl(observedUrl, payloadOperations);
  if (operation) {
    this.addEventListener('loadend', () => {
      let text = '';
      try {
        if (this.responseType === 'arraybuffer' && this.response instanceof ArrayBuffer) {
          text = decoder.decode(this.response);
        } else if (this.responseType === '' || this.responseType === 'text') {
          text = typeof this.responseText === 'string' ? this.responseText : '';
        }
      } catch {
        return;
      }
      const body = acceptJson(text);
      if (body) acceptBody(body, operation);
    });
  }
  return rawSend.call(this, body);
};
