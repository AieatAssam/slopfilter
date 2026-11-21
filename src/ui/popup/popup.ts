import { logger } from '@/shared/logger';
import { isExtensionMessage } from '@/shared/messages';
import { clearAllStats, loadWeeklyStats } from '@/storage/stats';

logger.debug('popup loaded');

const modelStatus = document.querySelector('[data-testid="slopfilter-model-status"]');
const modelRetry = document.querySelector('[data-testid="slopfilter-model-retry"]');
const modelProgress = document.querySelector('[data-testid="slopfilter-model-progress"]');

const renderModelStatus = (response: unknown) => {
  if (!isExtensionMessage(response) || response.type !== 'model-status') return;
  if (!(modelStatus instanceof HTMLElement)) return;
  const { status } = response;
  modelRetry?.toggleAttribute('hidden', status.state !== 'failed');
  if (modelProgress instanceof HTMLProgressElement) {
    modelProgress.hidden = status.state !== 'downloading';
    modelProgress.value = status.state === 'downloading' ? status.progress : 0;
  }
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

type PopupState = 'on' | 'paused' | 'idle';

const setPopupStatus = (state: PopupState, text: string): boolean => {
  const status = document.querySelector('[data-testid="slopfilter-popup-status"]');
  if (!(status instanceof HTMLElement)) return false;
  status.dataset.state = state;
  status.textContent = text;
  return true;
};

const renderStatus = (response: unknown): boolean => {
  if (!isExtensionMessage(response) || response.type !== 'selftest-result') {
    return setPopupStatus('idle', 'Open an X timeline to start filtering.');
  }

  if (!response.ok) {
    const failed = response.failedSelectorIds.length
      ? ` Failed selectors: ${response.failedSelectorIds.join(', ')}.`
      : '';
    return setPopupStatus(
      'paused',
      `Filtering is paused because the platform markup changed. Your feed is unfiltered.${failed}`,
    );
  }

  return setPopupStatus('on', 'Filtering is on.');
};

const timelineUrls = [
  'https://x.com/*',
  'https://twitter.com/*',
  ...(__SLOPFILTER_TEST_BUILD__ ? ['http://localhost:5174/*'] : []),
];

const isTimelineUrl = (url: string): boolean =>
  timelineUrls.some((pattern) => {
    const prefix = pattern.slice(0, -1);
    return url.startsWith(prefix);
  });

// Resolves true only when a content script answers with a committed self-test result.
const askTimelineTab = (tabId: number): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'get-selftest-state' }, (response) => {
        // Reading lastError clears it; a tab without a content script is simply not an answer.
        if (chrome.runtime.lastError) return resolve(false);
        if (!isExtensionMessage(response) || response.type !== 'selftest-result')
          return resolve(false);
        renderStatus(response);
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });

const loadStatus = () => {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    const tabId = tab?.id;
    if (tabId !== undefined && isTimelineUrl(tab?.url ?? '')) {
      void askTimelineTab(tabId).then((answered) => {
        if (!answered)
          chrome.runtime.sendMessage({ type: 'get-selftest-state', tabId }, renderStatus);
      });
      return;
    }
    // Popup opened as a tab or focused on another site: probe any open timeline tab before falling
    // back to the service worker's last known state.
    chrome.tabs.query({ url: timelineUrls }, (timelineTabs) => {
      const ids = timelineTabs.flatMap((candidate) =>
        candidate.id === undefined ? [] : [candidate.id],
      );
      void (async () => {
        for (const id of ids) {
          if (await askTimelineTab(id)) return;
        }
        chrome.runtime.sendMessage({ type: 'get-selftest-state' }, renderStatus);
      })();
    });
  });
};

chrome.runtime.onMessage.addListener((message) => {
  renderModelStatus(message);
  if (isExtensionMessage(message) && message.type === 'selftest-result') renderStatus(message);
});

const setStatValue = (tileId: string, value: string, note = false) => {
  const el = document.querySelector(`[data-testid="${tileId}-value"]`);
  if (!(el instanceof HTMLElement)) return;
  el.textContent = value;
  el.classList.toggle('sf-stat-note', note);
};

const renderStats = async () => {
  try {
    const stats = await loadWeeklyStats();
    setStatValue('slopfilter-stats-seen', String(stats.seen));
    setStatValue('slopfilter-stats-hidden', String(stats.hidden));
    if (stats.wrongCallRate === null) {
      setStatValue('slopfilter-stats-wrong-rate', 'not enough data yet', true);
    } else {
      setStatValue('slopfilter-stats-wrong-rate', `${(stats.wrongCallRate * 100).toFixed(1)}%`);
    }
  } catch {
    setStatValue('slopfilter-stats-wrong-rate', 'unavailable', true);
  }
};

document
  .querySelector('[data-testid="slopfilter-clear-statistics"]')
  ?.addEventListener('click', () => {
    void clearAllStats()
      .then(renderStats)
      .catch(() => undefined);
  });

document.getElementById('popup-settings')?.addEventListener('click', (event) => {
  event.preventDefault();
  void chrome.runtime.openOptionsPage();
});

document.getElementById('popup-privacy')?.addEventListener('click', (event) => {
  event.preventDefault();
  void chrome.tabs.create({ url: chrome.runtime.getURL('ui/privacy/privacy.html') });
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
