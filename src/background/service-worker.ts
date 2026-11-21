import { logger } from '@/shared/logger';
import { type ExtensionMessage, isExtensionMessage } from '@/shared/messages';
import { recordBatch, recordWrongCall } from '@/storage/stats';
import { maybeOpenOnboarding } from './onboarding';

type SelfTestState = Extract<ExtensionMessage, { type: 'selftest-result' }>;

// null until a content script reports, so the popup renders "idle" rather than a false "on".
let lastSelfTest: SelfTestState | null = null;
const selfTestsByTab = new Map<number, SelfTestState>();

// MV3 workers restart often and lose the maps above. Mirror them into session storage so the popup
// still reads the last committed self-test. Guarded: unit tests stub chrome without storage.session.
const canUseSession = (): boolean =>
  typeof chrome !== 'undefined' && Boolean(chrome.storage?.session);

const persistSelfTest = () => {
  if (!canUseSession()) return;
  void chrome.storage.session
    .set({ lastSelfTest, selfTestsByTab: Object.fromEntries(selfTestsByTab) })
    .catch(() => undefined);
};

const isSelfTestState = (value: unknown): value is SelfTestState =>
  isExtensionMessage(value) && value.type === 'selftest-result';

// Fills only gaps: anything already in memory is newer than what storage holds.
const hydrateSelfTest = async (): Promise<void> => {
  if (!canUseSession()) return;
  const stored = await chrome.storage.session.get(['lastSelfTest', 'selfTestsByTab']);
  if (lastSelfTest === null && isSelfTestState(stored.lastSelfTest)) {
    lastSelfTest = stored.lastSelfTest;
  }
  const byTab: unknown = stored.selfTestsByTab;
  if (typeof byTab !== 'object' || byTab === null) return;
  for (const [key, value] of Object.entries(byTab)) {
    const tabId = Number(key);
    if (!selfTestsByTab.has(tabId) && isSelfTestState(value)) selfTestsByTab.set(tabId, value);
  }
};

const isSupportedPageUrl = (url: string): boolean => {
  try {
    const { protocol, hostname, port } = new URL(url);
    if (protocol === 'https:' && (hostname === 'x.com' || hostname === 'twitter.com')) return true;
    return (
      __SLOPFILTER_TEST_BUILD__ &&
      protocol === 'http:' &&
      hostname === 'localhost' &&
      port === '5174'
    );
  } catch {
    return false;
  }
};

let offscreenCreation: Promise<void> | null = null;
let offscreenReady: Promise<void> | null = null;
let resolveOffscreenReady: (() => void) | null = null;

// Bounded forwards: a hung offscreen document or worker must fail open instead of holding the
// content script's request forever.
const INFERENCE_TIMEOUT_MS: Partial<Record<ExtensionMessage['type'], number>> = {
  'score-batch-request': 12_000,
  'text-pattern-download': 90_000,
};

const badgeScope = (tabId?: number) => (tabId === undefined ? {} : { tabId });

const ensureInferenceDocument = async (): Promise<void> => {
  const url = chrome.runtime.getURL('offscreen/offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (contexts.length > 0) {
    // The document already exists. It either survived a service-worker restart (module ran long
    // ago, listener live) or was created this session and is still announcing readiness.
    if (offscreenReady) await offscreenReady;
    return;
  }
  if (!offscreenCreation) {
    // createDocument resolves before the offscreen module has run, so its onMessage listener may
    // not exist yet. Gate forwarding on the offscreen's own offscreen-ready announcement instead of
    // assuming the document is reachable the instant it exists.
    offscreenReady = new Promise<void>((resolve) => {
      resolveOffscreenReady = resolve;
    });
    offscreenCreation = chrome.offscreen
      .createDocument({
        url: 'offscreen/offscreen.html',
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: 'Run local text models in a shared worker without blocking X tabs.',
      })
      .finally(() => {
        offscreenCreation = null;
      });
  }
  await offscreenCreation;
  await offscreenReady;
};

const forwardInferenceMessage = async (message: ExtensionMessage): Promise<unknown> => {
  const forward = (async () => {
    await ensureInferenceDocument();
    return chrome.runtime.sendMessage(message);
  })();
  const timeoutMs = INFERENCE_TIMEOUT_MS[message.type];
  if (timeoutMs === undefined) return forward;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      forward,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${message.type} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const forwardModelReady = async (message: ExtensionMessage): Promise<void> => {
  // Read the test-build flag per call, not at import, so the module loads outside the build harness.
  const urls = [
    'https://x.com/*',
    'https://twitter.com/*',
    ...(__SLOPFILTER_TEST_BUILD__ ? ['http://localhost:5174/*'] : []),
  ];
  const tabs = await chrome.tabs.query({ url: urls });
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? undefined
        : // Tabs without a content script reject; that is expected, not an error.
          chrome.tabs.sendMessage(tab.id, message).catch(() => undefined),
    ),
  );
};

export function handleMessage(message: unknown, tabId?: number): void {
  if (!isExtensionMessage(message)) return;
  if (message.type === 'record-stats-batch') {
    void recordBatch(message.entries).catch(() => undefined);
    return;
  }
  if (message.type === 'record-wrong-call') {
    void recordWrongCall(message.reasonIds).catch(() => undefined);
    return;
  }
  if (message.type !== 'selftest-result') return;
  if (typeof message.ok !== 'boolean' || !Array.isArray(message.failedSelectorIds)) return;

  lastSelfTest = message;
  if (tabId !== undefined) selfTestsByTab.set(tabId, message);
  persistSelfTest();
  if (message.ok) {
    if (typeof chrome !== 'undefined' && chrome.offscreen) {
      void ensureInferenceDocument().catch(() => undefined);
    }
    chrome.action.setBadgeText({ ...badgeScope(tabId), text: '' });
    chrome.action.setTitle({ ...badgeScope(tabId), title: 'SlopFilter' });
    return;
  }

  chrome.action.setBadgeText({ ...badgeScope(tabId), text: '!' });
  chrome.action.setTitle({
    ...badgeScope(tabId),
    title: 'SlopFilter is paused: the platform markup changed, so filtering is off.',
  });
}

export const getSelfTestState = (tabId?: number): SelfTestState | null =>
  tabId === undefined ? lastSelfTest : (selfTestsByTab.get(tabId) ?? null);

if (typeof chrome !== 'undefined') {
  chrome.runtime.onInstalled.addListener(() => {
    logger.debug('service worker installed');
    void maybeOpenOnboarding().catch(() => undefined);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (selfTestsByTab.delete(tabId)) persistSelfTest();
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    // Same-origin X route changes keep the tab's state; only a fresh load or leaving X clears it.
    const leftSupportedOrigin = changeInfo.url !== undefined && !isSupportedPageUrl(changeInfo.url);
    if (changeInfo.status !== 'loading' && !leftSupportedOrigin) return;
    if (selfTestsByTab.delete(tabId)) persistSelfTest();
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isExtensionMessage(message) && message.type === 'offscreen-ready') {
      resolveOffscreenReady?.();
      resolveOffscreenReady = null;
      return false;
    }
    if (isExtensionMessage(message) && message.type === 'get-selftest-state') {
      if (getSelfTestState(message.tabId) !== null || !canUseSession()) {
        // Answer immediately; a tab that has not reported yet is simply "idle", never a hang.
        sendResponse(getSelfTestState(message.tabId));
        return false;
      }
      // A restarted worker has empty maps; restore from session storage before answering.
      void hydrateSelfTest()
        .catch(() => undefined)
        .then(() => sendResponse(getSelfTestState(message.tabId)));
      return true;
    }
    if (isExtensionMessage(message) && message.type === 'model-ready') {
      // Only the offscreen host announces models; anything else is ignored.
      if (!sender.url?.endsWith('offscreen/offscreen.html')) return false;
      void forwardModelReady(message).catch(() => undefined);
      return false;
    }
    if (isExtensionMessage(message) && message.type === 'record-stats-batch') {
      void recordBatch(message.entries).then(
        () => sendResponse(true),
        () => sendResponse(false),
      );
      return true;
    }
    if (
      isExtensionMessage(message) &&
      (message.type === 'score-batch-request' ||
        message.type === 'embed-request' ||
        message.type === 'downvote-post' ||
        message.type === 'model-status-request' ||
        message.type === 'model-retry' ||
        message.type === 'text-pattern-download')
    ) {
      void forwardInferenceMessage(message).then(sendResponse, () => sendResponse(null));
      return true;
    }
    handleMessage(message, sender.tab?.id);
    return false;
  });
}

logger.debug('service worker loaded');
