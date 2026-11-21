import { type ContentTheme, themeClass } from '@/content/themes';
import type { Post } from '@/core/post';
import type { LayerId, ScoreBreakdown } from '@/core/scoring/types';
import { isExtensionMessage } from '@/shared/messages';
import { type AccountState, setAccountState } from '@/storage/accounts';
import { addEmbedding } from '@/storage/embeddings';
import { LAYER_IDS } from '@/storage/settings';
import { openInspector } from './inspector';

export interface FeedbackOptions {
  breakdown: ScoreBreakdown;
  theme?: ContentTheme;
  findAnchorHost?: (element: HTMLElement) => HTMLElement | null;
  embedText?: (text: string) => Promise<Float32Array | null>;
  onWrongCall?: () => void;
  enabledLayers?: Partial<Record<LayerId, boolean>>;
  getBreakdown?: () => ScoreBreakdown;
  onAccountStateChanged?: (state: AccountState) => void;
}

const enabledLayersFor = (options: FeedbackOptions): Record<LayerId, boolean> =>
  Object.fromEntries(
    LAYER_IDS.map((layerId) => [layerId, options.enabledLayers?.[layerId] ?? true]),
  ) as Record<LayerId, boolean>;

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
  const host = options.findAnchorHost?.(element) ?? element;
  let anchor = element.querySelector<HTMLDivElement>('[data-testid="slopfilter-anchor"]');
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.className = 'slopfilter-anchor';
    anchor.dataset.testid = 'slopfilter-anchor';
    if (host === element) host.prepend(anchor);
    else if (host.firstElementChild) host.firstElementChild.after(anchor);
    else host.append(anchor);
  }
  if (anchor.querySelector('[data-testid="slopfilter-feedback"]')) return;
  const controls = document.createElement('div');
  controls.className = `slopfilter-feedback ${themeClass(options.theme ?? 'generic')}`;
  controls.dataset.testid = 'slopfilter-feedback';

  const downvote = addButton('Not interested', 'slopfilter-downvote');
  downvote.addEventListener('click', async () => {
    downvote.textContent = 'Saving…';
    downvote.disabled = true;
    downvote.setAttribute('aria-label', 'Not interested — saving');

    const localSave = options.embedText
      ? options
          .embedText(post.text)
          .then((vector) =>
            vector
              ? addEmbedding({ postId: post.id, vector, createdAt: Date.now() }).then(() => true)
              : false,
          )
          .catch(() => false)
      : Promise.resolve(false);
    const remoteSave = Promise.resolve()
      .then(() =>
        chrome.runtime.sendMessage({
          type: 'downvote-post',
          postId: post.id,
          text: post.text,
        }),
      )
      .then(
        (response) =>
          isExtensionMessage(response) &&
          response.type === 'downvote-complete' &&
          response.postId === post.id &&
          response.ok,
        () => false,
      );
    const saved = (await Promise.all([localSave, remoteSave])).some(Boolean);
    downvote.textContent = saved ? 'Saved' : 'Try again';
    downvote.disabled = saved;
    downvote.setAttribute(
      'aria-label',
      saved ? 'Not interested — saved' : 'Not interested — save failed, try again',
    );
    downvote.setAttribute('aria-pressed', String(saved));
  });

  const why = addButton('Why this score', 'slopfilter-inspector-trigger');
  why.addEventListener('click', () => {
    const breakdown = options.getBreakdown?.() ?? options.breakdown;
    openInspector(post, {
      breakdown,
      enabledLayers: enabledLayersFor(options),
    });
  });

  const accountOptions = addButton('Account options');
  accountOptions.setAttribute('aria-expanded', 'false');
  const menuId = `slopfilter-menu-${post.id}`;
  const menu = document.createElement('div');
  menu.className = 'slopfilter-account-menu';
  menu.id = menuId;
  menu.setAttribute('popover', 'auto');
  accountOptions.setAttribute('popovertarget', menuId);
  menu.addEventListener('toggle', (event) => {
    if (typeof (event as ToggleEvent).newState !== 'string') return;
    accountOptions.setAttribute(
      'aria-expanded',
      String((event as ToggleEvent).newState === 'open'),
    );
  });
  for (const [label, state] of [
    ['Mute this account', 'muted'],
    ['Always show this account', 'trusted'],
    ['Filter images only', 'images-only'],
  ] as const) {
    const button = addButton(label);
    button.addEventListener('click', () => {
      button.disabled = true;
      void setAccountState(post.author.handle, state).then(
        () => {
          if (typeof menu.hidePopover === 'function') menu.hidePopover();
          options.onAccountStateChanged?.(state);
        },
        () => {
          button.disabled = false;
        },
      );
    });
    menu.append(button);
  }

  controls.append(why, downvote, accountOptions, menu);
  if (options.onWrongCall) {
    const wrongCall = addButton('This was wrong');
    wrongCall.addEventListener('click', () => {
      handleWrongCall(
        post,
        options.getBreakdown?.() ?? options.breakdown,
        options.onWrongCall ?? (() => undefined),
      );
    });
    controls.append(wrongCall);
  }
  anchor.append(controls);
};
