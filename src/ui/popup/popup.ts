import { logger } from '@/shared/logger';
import { isExtensionMessage } from '@/shared/messages';

logger.debug('popup loaded');

const renderStatus = (response: unknown) => {
  const status = document.querySelector('[data-testid="slopfilter-popup-status"]');
  if (!(status instanceof HTMLElement)) return;

  if (isExtensionMessage(response) && response.type === 'selftest-result' && !response.ok) {
    const failed = response.failedSelectorIds.length
      ? ` Failed selectors: ${response.failedSelectorIds.join(', ')}.`
      : '';
    status.textContent = `Filtering is paused because the platform markup changed. Your feed is unfiltered.${failed}`;
    return;
  }

  status.textContent = 'Filtering is on.';
};

const loadStatus = () => {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    chrome.runtime.sendMessage(
      tabId === undefined ? { type: 'get-selftest-state' } : { type: 'get-selftest-state', tabId },
      renderStatus,
    );
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadStatus, { once: true });
} else {
  loadStatus();
}
