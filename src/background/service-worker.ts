import { logger } from '@/shared/logger';
import { type ExtensionMessage, isExtensionMessage } from '@/shared/messages';

type SelfTestState = Extract<ExtensionMessage, { type: 'selftest-result' }>;

let lastSelfTest: SelfTestState = {
  type: 'selftest-result',
  ok: true,
  failedSelectorIds: [],
};

export function handleMessage(message: unknown): void {
  if (!isExtensionMessage(message) || message.type !== 'selftest-result') return;
  if (typeof message.ok !== 'boolean' || !Array.isArray(message.failedSelectorIds)) return;

  lastSelfTest = message;
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

if (typeof chrome !== 'undefined') {
  chrome.runtime.onInstalled.addListener(() => logger.debug('service worker installed'));
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isExtensionMessage(message) && message.type === 'get-selftest-state') {
      sendResponse(lastSelfTest);
      return true;
    }
    handleMessage(message);
    return false;
  });
}

logger.debug('service worker loaded');
