import { type ContentTheme, themeClass } from '@/content/themes';
import type { Post } from '@/core/post';
import type { ScoreBreakdown } from '@/core/scoring/types';
import { setAccountState } from '@/storage/accounts';
import { addEmbedding } from '@/storage/embeddings';

export interface FeedbackOptions {
  breakdown: ScoreBreakdown;
  theme?: ContentTheme;
  embedText?: (text: string) => Promise<Float32Array | null>;
  onWrongCall?: () => void;
}

const addButton = (label: string, testId?: string): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (testId) button.dataset.testid = testId;
  return button;
};

export const handleWrongCall = (
  post: Post,
  breakdown: ScoreBreakdown,
  restore: () => void,
): void => {
  restore();
  try {
    const response = chrome.runtime.sendMessage({
      type: 'record-wrong-call',
      reasonIds: breakdown.contributions.map((contribution) => contribution.layerId),
    });
    void response.catch(() => undefined);
  } catch {
    // Wrong-call logging is optional; restoration has already happened synchronously.
  }
  void chrome.storage.local
    .get('exclusions')
    .then((stored) => {
      const exclusions = Array.isArray(stored.exclusions) ? stored.exclusions : [];
      if (!exclusions.includes(post.id)) {
        return chrome.storage.local.set({ exclusions: [...exclusions, post.id] });
      }
      return undefined;
    })
    .catch(() => undefined);
};

export const attachFeedbackControls = (
  element: HTMLElement,
  post: Post,
  options: FeedbackOptions,
): void => {
  let anchor = element.querySelector<HTMLDivElement>('[data-testid="slopfilter-anchor"]');
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.className = 'slopfilter-anchor';
    anchor.dataset.testid = 'slopfilter-anchor';
    element.prepend(anchor);
  }
  if (anchor.querySelector('[data-testid="slopfilter-feedback"]')) return;
  const controls = document.createElement('div');
  controls.className = `slopfilter-feedback ${themeClass(options.theme ?? 'generic')}`;
  controls.dataset.testid = 'slopfilter-feedback';

  const downvote = addButton('Not interested', 'slopfilter-downvote');
  downvote.addEventListener('click', () => {
    if (options.embedText) {
      void options.embedText(post.text).then((vector) => {
        if (!vector) return;
        return addEmbedding({ postId: post.id, vector, createdAt: Date.now() });
      });
    }
    try {
      const response = chrome.runtime.sendMessage({
        type: 'downvote-post',
        postId: post.id,
        text: post.text,
      });
      void response.catch(() => undefined);
    } catch {
      // Feedback remains local even when the service worker is unavailable.
    }
  });

  const accountOptions = addButton('Account options');
  accountOptions.setAttribute('aria-haspopup', 'menu');
  accountOptions.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div');
  menu.className = 'slopfilter-account-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  const toggleMenu = () => {
    menu.hidden = !menu.hidden;
    accountOptions.setAttribute('aria-expanded', String(!menu.hidden));
  };
  accountOptions.addEventListener('click', toggleMenu);
  for (const [label, state] of [
    ['Mute this account', 'muted'],
    ['Always show this account', 'trusted'],
    ['Filter images only', 'images-only'],
  ] as const) {
    const button = addButton(label);
    button.addEventListener('click', () => {
      void setAccountState(post.author.handle, state);
      menu.hidden = true;
      accountOptions.setAttribute('aria-expanded', 'false');
    });
    menu.append(button);
  }

  controls.append(downvote, accountOptions, menu);
  if (options.onWrongCall) {
    const wrongCall = addButton('This was wrong');
    wrongCall.addEventListener('click', () => {
      handleWrongCall(post, options.breakdown, options.onWrongCall ?? (() => undefined));
    });
    controls.append(wrongCall);
  }
  anchor.append(controls);
};
