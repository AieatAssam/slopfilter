import { logger } from '@/shared/logger';
import { type ExtensionMessage, isExtensionMessage } from '@/shared/messages';

type SelfTestState = Extract<ExtensionMessage, { type: 'selftest-result' }>;

let lastSelfTest: SelfTestState = {
  type: 'selftest-result',
  ok: true,
  failedSelectorIds: [],
};
const selfTestsByTab = new Map<number, SelfTestState>();

export function handleMessage(message: unknown, tabId?: number): void {
  if (!isExtensionMessage(message) || message.type !== 'selftest-result') return;
  if (typeof message.ok !== 'boolean' || !Array.isArray(message.failedSelectorIds)) return;

  lastSelfTest = message;
  if (tabId !== undefined) selfTestsByTab.set(tabId, message);
  if (message.ok) {
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
  chrome.runtime.onInstalled.addListener(() => logger.debug('service worker installed'));
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isExtensionMessage(message) && message.type === 'get-selftest-state') {
      sendResponse(getSelfTestState(message.tabId));
      return true;
    }
    handleMessage(message, sender.tab?.id);
    return false;
  });
}

logger.debug('service worker loaded');
