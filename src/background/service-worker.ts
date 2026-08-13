import { logger } from '@/shared/logger';
import { type ExtensionMessage, isExtensionMessage } from '@/shared/messages';
import { recordBatch, recordWrongCall } from '@/storage/stats';
import { maybeOpenOnboarding } from './onboarding';

type SelfTestState = Extract<ExtensionMessage, { type: 'selftest-result' }>;

let lastSelfTest: SelfTestState = {
  type: 'selftest-result',
  ok: true,
  failedSelectorIds: [],
};
const selfTestsByTab = new Map<number, SelfTestState>();
const pendingSelfTestRequests: {
  tabId?: number;
  sendResponse: (response: SelfTestState | null) => void;
}[] = [];
let offscreenCreation: Promise<void> | null = null;
let offscreenReady: Promise<void> | null = null;
let resolveOffscreenReady: (() => void) | null = null;

const resolvePendingSelfTestRequests = () => {
  for (let index = pendingSelfTestRequests.length - 1; index >= 0; index -= 1) {
    const pending = pendingSelfTestRequests[index];
    if (!pending) continue;
    const state = getSelfTestState(pending.tabId);
    if (!state) continue;
    pendingSelfTestRequests.splice(index, 1);
    pending.sendResponse(state);
  }
};

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
  await ensureInferenceDocument();
  return chrome.runtime.sendMessage(message);
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
  resolvePendingSelfTestRequests();
  if (message.ok) {
    if (typeof chrome !== 'undefined' && chrome.offscreen) {
      void ensureInferenceDocument().catch(() => undefined);
    }
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'SlopFilter' });
    return;
  }

  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setTitle({
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
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isExtensionMessage(message) && message.type === 'offscreen-ready') {
      resolveOffscreenReady?.();
      resolveOffscreenReady = null;
      return false;
    }
    if (isExtensionMessage(message) && message.type === 'get-selftest-state') {
      const state = getSelfTestState(message.tabId);
      if (state) sendResponse(state);
      else if (message.tabId === undefined) pendingSelfTestRequests.push({ sendResponse });
      else pendingSelfTestRequests.push({ tabId: message.tabId, sendResponse });
      return true;
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
