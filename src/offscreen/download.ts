export const STALL_TIMEOUT_MS = 30_000;

export type DownloadState = 'idle' | 'downloading' | 'ready' | 'failed';
export type DownloadProgress = (received: number, total: number) => void;

interface DownloadOptions {
  now: () => number;
  load: (onProgress: DownloadProgress) => Promise<void>;
  onStateChange?: (state: DownloadState) => void;
}

export const createDownloadTracker = ({ now, load, onStateChange }: DownloadOptions) => {
  let state: DownloadState = 'idle';
  let received = 0;
  let total = 0;
  let lastProgress = 0;
  let started = false;

  const setState = (next: DownloadState) => {
    state = next;
    onStateChange?.(next);
  };

  const start = () => {
    if (started && state !== 'failed') return;
    started = true;
    received = 0;
    total = 0;
    lastProgress = now();
    setState('downloading');
    void load((nextReceived, nextTotal) => {
      received = Math.max(0, nextReceived);
      total = Math.max(0, nextTotal);
      lastProgress = now();
    })
      .then(() => setState('ready'))
      .catch(() => setState('failed'));
  };

  const retry = () => {
    if (getState() === 'failed') start();
  };

  const getState = (): DownloadState => {
    if (state === 'downloading' && now() - lastProgress > STALL_TIMEOUT_MS) setState('failed');
    return state;
  };

  return {
    start,
    retry,
    getState,
    getPercent: () => (total > 0 ? Math.min(100, (received / total) * 100) : 0),
  };
};
