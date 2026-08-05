import { xAdapter } from '@/adapters/x/adapter';
import { logger } from '@/shared/logger';

logger.debug('content script loaded');

const result = xAdapter.selfTest(document);
chrome.runtime.sendMessage({
  type: 'selftest-result',
  ok: result.ok,
  failedSelectorIds: result.failedSelectorIds,
});
