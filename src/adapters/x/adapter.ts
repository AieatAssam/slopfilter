import type { PlatformAdapter, SelectorCheckResult } from '@/adapters/types';
import type { Post, PostAuthor, PostEngagement } from '@/core/post';
import { getEntry, resolveSelector, type SelectorEntry, selectorContract } from './selectors';
import { runSelfTest } from './selftest';

const firstMatch = (root: ParentNode, entry: SelectorEntry): Element | null =>
  resolveSelector(root, entry);

const allMatches = (root: ParentNode, entry: SelectorEntry): Element[] => {
  for (const selector of entry.selectors) {
    try {
      const matches = Array.from(root.querySelectorAll(selector));
      if (matches.length > 0) return matches;
    } catch {
      // Invalid fallbacks are non-matches; the adapter fails open.
    }
  }
  return [];
};

export function parseCompactCount(raw: string | null | undefined): number | null {
  const value = raw?.trim().replaceAll(',', '');
  if (!value) return null;
  const suffix = value.at(-1)?.toUpperCase();
  const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : 1;
  const numberText = multiplier === 1 ? value : value.slice(0, -1);
  const parsed = Number(numberText);
  return Number.isFinite(parsed) ? parsed * multiplier : null;
}

const countFrom = (element: Element | null): number | null => {
  if (!element) return null;
  const raw = element.textContent?.trim() || element.getAttribute('aria-label') || '';
  const match = raw.match(/[0-9][0-9,.]*(?:\s*[KM])?/i);
  return parseCompactCount(match?.[0] ?? null);
};

const textOf = (element: Element | null): string => element?.textContent?.trim() ?? '';

const entryMatches = (root: ParentNode, id: string): Element[] => allMatches(root, getEntry(id));

export const xAdapter: PlatformAdapter = {
  platform: 'x',
  selectorContractVersion: selectorContract.contractVersion,

  findTimelineContainer(root) {
    return firstMatch(root, getEntry('timeline-container'));
  },

  findPostElements(container) {
    return allMatches(container, getEntry('post-article'));
  },

  extractPost(element): Post | null {
    try {
      const handleAnchor = firstMatch(element, getEntry('author-handle'))?.closest(
        '[data-testid="User-Name"]',
      );
      if (!handleAnchor) return null;

      const authorValues = Array.from(handleAnchor.querySelectorAll('div[dir="ltr"]'))
        .map(textOf)
        .filter(Boolean);
      const handle = authorValues.find((value) => value.startsWith('@'));
      const displayName = authorValues.find((value) => !value.startsWith('@') && value !== '·');
      const permalinkElement = firstMatch(element, getEntry('post-permalink'));
      const href = permalinkElement?.getAttribute('href') ?? '';
      const statusMatch = href.match(/\/status\/([^/?]+)/);
      const text = textOf(firstMatch(element, getEntry('post-text')));
      if (!handle || !text || !statusMatch?.[1]) return null;

      const author: PostAuthor = {
        handle,
        displayName: displayName ?? handle,
        profileUrl: handleAnchor.querySelector('a[href]')?.getAttribute('href') ?? null,
      };
      const engagement: PostEngagement = {
        replies: countFrom(firstMatch(element, getEntry('engagement-replies'))),
        reposts: countFrom(firstMatch(element, getEntry('engagement-reposts'))),
        likes: countFrom(firstMatch(element, getEntry('engagement-likes'))),
        views: countFrom(firstMatch(element, getEntry('engagement-views'))),
      };
      const timestamp = firstMatch(element, getEntry('post-timestamp'));

      return {
        id: statusMatch[1],
        permalink: href.match(/^(.*\/status\/[^/?]+)/)?.[1] ?? href,
        text,
        postedAt: timestamp?.getAttribute('datetime') ?? null,
        author,
        engagement,
        imageUrls: entryMatches(element, 'post-images')
          .map((image) => image.getAttribute('src'))
          .filter((src): src is string => Boolean(src)),
        hasVideo: firstMatch(element, getEntry('post-video')) !== null,
      };
    } catch {
      return null;
    }
  },

  selfTest(root): SelectorCheckResult {
    const result = runSelfTest(root);
    return { ok: result.ok, failedSelectorIds: result.failedSelectorIds };
  },
};
