import { logger } from '@/shared/logger';
import { isExtensionMessage } from '@/shared/messages';
import { clearAllStats, loadWeeklyStats } from '@/storage/stats';

logger.debug('popup loaded');

const modelStatus = document.querySelector('[data-testid="slopfilter-model-status"]');
const modelRetry = document.querySelector('[data-testid="slopfilter-model-retry"]');

const renderModelStatus = (response: unknown) => {
  if (!isExtensionMessage(response) || response.type !== 'model-status') return;
  if (!(modelStatus instanceof HTMLElement)) return;
  const { status } = response;
  modelRetry?.toggleAttribute('hidden', status.state !== 'failed');
  if (status.state === 'idle') modelStatus.textContent = 'Models have not started loading.';
  if (status.state === 'downloading')
    modelStatus.textContent = `Loading the filter models, ${Math.round(status.progress)} percent.`;
  if (status.state === 'ready') modelStatus.textContent = 'All filters active.';
  if (status.state === 'failed')
    modelStatus.textContent =
      'Some filters are unavailable, so less is being filtered. Your feed is unaffected otherwise.';
};

modelRetry?.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'model-retry' }, renderModelStatus);
});

void chrome.runtime.sendMessage({ type: 'model-status-request' }, renderModelStatus);

const renderStatus = (response: unknown): boolean => {
  const status = document.querySelector('[data-testid="slopfilter-popup-status"]');
  if (!(status instanceof HTMLElement)) return false;

  if (response === null) {
    status.textContent = 'Waiting for the timeline check…';
    return true;
  }

  if (!isExtensionMessage(response) || response.type !== 'selftest-result') {
    status.textContent = 'Waiting for the timeline check…';
    return true;
  }

  if (!response.ok) {
    const failed = response.failedSelectorIds.length
      ? ` Failed selectors: ${response.failedSelectorIds.join(', ')}.`
      : '';
    status.textContent = `Filtering is paused because the platform markup changed. Your feed is unfiltered.${failed}`;
    return true;
  }

  status.textContent = 'Filtering is on.';
  return true;
};

const loadStatus = () => {
  const status = document.querySelector('[data-testid="slopfilter-popup-status"]');
  if (status instanceof HTMLElement) status.textContent = 'Waiting for the timeline check…';
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    const tabId = tab?.id;
    const tabUrl = tab?.url ?? '';
    const isTimelineTab =
      tabUrl.startsWith('https://x.com/') ||
      tabUrl.startsWith('https://twitter.com/') ||
      (__SLOPFILTER_TEST_BUILD__ && tabUrl.startsWith('http://localhost:5174/'));
    const useGlobalState = tabId === undefined || !isTimelineTab;
    if (useGlobalState || tabId === undefined) {
      chrome.runtime.sendMessage({ type: 'get-selftest-state' }, renderStatus);
      return;
    }
    try {
      chrome.tabs.sendMessage(tabId, { type: 'get-selftest-state' }, (response) => {
        if (isExtensionMessage(response) && response.type === 'selftest-result') {
          renderStatus(response);
          return;
        }
        chrome.runtime.sendMessage({ type: 'get-selftest-state', tabId }, renderStatus);
      });
    } catch {
      chrome.runtime.sendMessage({ type: 'get-selftest-state', tabId }, renderStatus);
    }
  });
};

chrome.runtime.onMessage.addListener((message) => {
  renderModelStatus(message);
  if (isExtensionMessage(message) && message.type === 'selftest-result') renderStatus(message);
});

const renderStats = async () => {
  try {
    const stats = await loadWeeklyStats();
    const seen = document.querySelector('[data-testid="slopfilter-stats-seen"]');
    const hidden = document.querySelector('[data-testid="slopfilter-stats-hidden"]');
    const wrongRate = document.querySelector('[data-testid="slopfilter-stats-wrong-rate"]');
    if (seen) seen.textContent = `Posts seen: ${stats.seen}`;
    if (hidden) hidden.textContent = `Posts hidden: ${stats.hidden}`;
    if (wrongRate) {
      wrongRate.textContent =
        stats.wrongCallRate === null
          ? 'Wrong-call rate: not enough data yet'
          : `Wrong-call rate: ${(stats.wrongCallRate * 100).toFixed(1)}%`;
    }
  } catch {
    const wrongRate = document.querySelector('[data-testid="slopfilter-stats-wrong-rate"]');
    if (wrongRate) wrongRate.textContent = 'Statistics unavailable.';
  }
};

document
  .querySelector('[data-testid="slopfilter-clear-statistics"]')
  ?.addEventListener('click', () => {
    void clearAllStats()
      .then(renderStats)
      .catch(() => undefined);
  });

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      loadStatus();
      void renderStats();
    },
    { once: true },
  );
} else {
  loadStatus();
  void renderStats();
}
