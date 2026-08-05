import { logger } from '@/shared/logger';

chrome.runtime.onInstalled.addListener(() => logger.debug('service worker installed'));
logger.debug('service worker loaded');
