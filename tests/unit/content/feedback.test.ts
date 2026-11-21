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
    runtime: {
      sendMessage: vi.fn((message: { type?: string; postId?: string }) =>
        Promise.resolve(
          message.type === 'downvote-post'
            ? { type: 'downvote-complete', postId: message.postId, ok: true }
            : undefined,
        ),
      ),
    },
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

    expect(element.querySelector('[data-testid="slopfilter-downvote"]')?.textContent).toBe(
      'Not interested',
    );
  });

  test('downvoting shows progress, confirms persistence, and prevents duplicate clicks', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    attachFeedbackControls(element, post, { breakdown });

    const button = element.querySelector('[data-testid="slopfilter-downvote"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error('downvote missing');
    button.click();

    expect(button.textContent).toBe('Saving…');
    expect(button.disabled).toBe(true);
    await vi.waitFor(() => expect(button.textContent).toBe('Saved'));
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  test('downvoting restores a retry when persistence fails', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValueOnce(new Error('worker unavailable'));
    const element = document.createElement('div');
    document.body.append(element);
    attachFeedbackControls(element, post, { breakdown });

    const button = element.querySelector('[data-testid="slopfilter-downvote"]');
    if (!(button instanceof HTMLButtonElement)) throw new Error('downvote missing');
    button.click();

    await vi.waitFor(() => expect(button.textContent).toBe('Try again'));
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  test('creates one anchor as the first child and keeps it across attaches', () => {
    const element = document.createElement('div');
    const attachedChild = document.createElement('div');
    element.append(attachedChild);
    document.body.append(element);

    attachFeedbackControls(element, post, { breakdown });
    attachFeedbackControls(element, { ...post, id: 'post-2' }, { breakdown });
    attachFeedbackControls(element, { ...post, id: 'post-3' }, { breakdown });

    const anchors = element.querySelectorAll('[data-testid="slopfilter-anchor"]');
    expect(anchors).toHaveLength(1);
    expect(element.firstElementChild).toBe(anchors[0]);
    expect(element.querySelectorAll('[data-testid="slopfilter-feedback"]')).toHaveLength(1);
    expect(anchors[0]?.contains(attachedChild)).toBe(false);
    expect(attachedChild).toBe(element.children[1]);
  });

  test('re-creates an anchor wiped by a simulated re-render', () => {
    const element = document.createElement('div');
    document.body.append(element);

    attachFeedbackControls(element, post, { breakdown });
    const anchor = element.querySelector('[data-testid="slopfilter-anchor"]');
    anchor?.remove();

    attachFeedbackControls(element, post, { breakdown });

    const anchors = element.querySelectorAll('[data-testid="slopfilter-anchor"]');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.querySelectorAll('[data-testid="slopfilter-feedback"]')).toHaveLength(1);
  });

  test('never assigns a style property to the article', () => {
    const element = document.createElement('div');
    document.body.append(element);

    attachFeedbackControls(element, post, { breakdown });

    for (const key of ['position', 'top', 'right', 'left', 'bottom', 'zIndex']) {
      expect(element.style[key as keyof CSSStyleDeclaration]).toBe('');
    }
  });

  test('the account menu is a popover whose trigger targets its id', () => {
    const element = document.createElement('div');
    document.body.append(element);
    attachFeedbackControls(element, post, { breakdown });

    const menu = element.querySelector('.slopfilter-account-menu');
    const trigger = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent === 'Account options',
    );
    if (!(menu instanceof HTMLElement) || !(trigger instanceof HTMLButtonElement)) {
      throw new Error('menu or trigger missing');
    }

    expect(menu.getAttribute('popover')).toBe('auto');
    expect(menu.id).toBeTruthy();
    expect(trigger.getAttribute('popovertarget')).toBe(menu.id);
    expect(menu.hasAttribute('role')).toBe(false);
    expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
  });

  test('aria-expanded tracks a popover toggle event', () => {
    const element = document.createElement('div');
    document.body.append(element);
    attachFeedbackControls(element, post, { breakdown });

    const trigger = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent === 'Account options',
    );
    const menu = element.querySelector('.slopfilter-account-menu');
    if (!(trigger instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) {
      throw new Error('menu or trigger missing');
    }

    const dispatchToggle = (newState: 'open' | 'closed') => {
      const event = new Event('toggle');
      Object.defineProperty(event, 'newState', { value: newState });
      menu.dispatchEvent(event);
    };
    dispatchToggle('open');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    dispatchToggle('closed');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  test('account changes notify the feed after storage succeeds', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const onAccountStateChanged = vi.fn();
    attachFeedbackControls(element, post, { breakdown, onAccountStateChanged });

    const mute = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent === 'Mute this account',
    );
    mute?.click();

    await vi.waitFor(() => expect(onAccountStateChanged).toHaveBeenCalledWith('muted'));
  });
});
