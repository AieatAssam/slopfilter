import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { attachFeedbackControls } from '@/content/feedback';
import type { Post } from '@/core/post';
import type { ScoreBreakdown } from '@/core/scoring/types';
import { clearAll, countEmbeddings, DB_NAME } from '@/storage/embeddings';

const post: Post = {
  id: 'post-1',
  permalink: null,
  text: 'post text',
  postedAt: null,
  author: { handle: '@handle', displayName: 'Handle', profileUrl: null },
  engagement: { replies: 0, reposts: 0, likes: 0, views: 0 },
  imageUrls: [],
  hasVideo: false,
};

const breakdown: ScoreBreakdown = {
  compositeScore: 0.8,
  threshold: 0.6,
  hidden: true,
  contributions: [
    { layerId: 'behavioural', score: 0.8, weight: 1, weighted: 0.8, reason: 'frequency' },
  ],
  reasons: ['frequency'],
};

const resetDatabase = async () => {
  await clearAll().catch(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

beforeEach(async () => {
  document.body.replaceChildren();
  await resetDatabase();
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(() => Promise.resolve()) },
    storage: { local: { get: vi.fn(async () => ({ exclusions: [] })), set: vi.fn() } },
  });
});

describe('feedback controls', () => {
  test('downvoting the same post twice stores one embedding', async () => {
    const element = document.createElement('article');
    document.body.append(element);
    attachFeedbackControls(element, post, {
      breakdown,
      embedText: async () => new Float32Array([1, 0]),
    });

    const button = element.querySelector('[data-testid="slopfilter-downvote"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error('downvote missing');
    button.click();
    button.click();
    await vi.waitFor(async () => expect(await countEmbeddings()).toBe(1));

    expect(await countEmbeddings()).toBe(1);
  });

  test('wrong call restores immediately', () => {
    const element = document.createElement('div');
    element.style.display = 'none';
    document.body.append(element);
    let restored = false;
    attachFeedbackControls(element, post, {
      breakdown,
      onWrongCall: () => {
        restored = true;
        element.style.display = '';
      },
    });

    const wrongCall = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent === 'This was wrong',
    );
    wrongCall?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(restored).toBe(true);
    expect(element.style.display).toBe('');
  });

  test('records which layers misfired through the local message', () => {
    const element = document.createElement('div');
    document.body.append(element);
    attachFeedbackControls(element, post, { breakdown, onWrongCall: vi.fn() });

    const wrongCall = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent === 'This was wrong',
    );
    wrongCall?.click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'record-wrong-call',
      reasonIds: ['behavioural'],
    });
  });

  test('the thumbs-down control has an accessible name', () => {
    const element = document.createElement('div');
    document.body.append(element);
    attachFeedbackControls(element, post, { breakdown });

    expect(element.querySelector('button')?.textContent).toBe('Not interested');
  });
});
