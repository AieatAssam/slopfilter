import { logger } from '@/shared/logger';
import { isExtensionMessage } from '@/shared/messages';

logger.debug('popup loaded');

const renderStatus = (response: unknown): boolean => {
  const status = document.querySelector('[data-testid="slopfilter-popup-status"]');
  if (!(status instanceof HTMLElement)) return false;

  if (response === null) {
    status.textContent = 'Checking the feed…';
    return false;
  }

  if (isExtensionMessage(response) && response.type === 'selftest-result' && !response.ok) {
    const failed = response.failedSelectorIds.length
      ? ` Failed selectors: ${response.failedSelectorIds.join(', ')}.`
      : '';
    status.textContent = `Filtering is paused because the platform markup changed. Your feed is unfiltered.${failed}`;
    return true;
  }

  status.textContent = 'Filtering is on.';
  return true;
};

const loadStatus = (attempt = 0) => {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    const tabId = tab?.id;
    const useGlobalState = tabId === undefined || tab?.url?.startsWith('chrome-extension://');
    chrome.runtime.sendMessage(
      useGlobalState ? { type: 'get-selftest-state' } : { type: 'get-selftest-state', tabId },
      (response) => {
        if (renderStatus(response)) return;
        if (attempt < 30) {
          window.setTimeout(() => loadStatus(attempt + 1), 100);
          return;
        }
        chrome.runtime.sendMessage({ type: 'get-selftest-state' }, renderStatus);
      },
    );
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => loadStatus(), { once: true });
} else {
  loadStatus();
}
