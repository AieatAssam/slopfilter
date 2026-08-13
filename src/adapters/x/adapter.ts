import type { PlatformAdapter, ProfileStats, SelectorCheckResult } from '@/adapters/types';
import type { Post, PostAuthor, PostEngagement } from '@/core/post';
import { getEntry, resolveSelector, type SelectorEntry, selectorContract } from './selectors';
import { runFeedSelfTest, runSelfTest } from './selftest';

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

const hasAdLabel = (root: ParentNode): boolean =>
  entryMatches(root, 'ad-label').some(
    (element) =>
      textOf(element).toLowerCase() === 'ad' &&
      !element.closest('[data-testid="User-Name"], [data-testid="tweetText"]'),
  );

const PROFILE_JOIN_DATE_RE = /joined\s+([A-Za-z]+)\s+(\d{4})/i;
const PROFILE_POST_COUNT_RE = /(\d[\d,.]*(?:\s*[km])?)\s*posts?/i;

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
        '[data-testid="User-Name"], [data-testid="UserName"]',
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
        isAd: hasAdLabel(element),
      };
    } catch {
      return null;
    }
  },

  selfTest(root): SelectorCheckResult {
    const result = runSelfTest(root);
    return { ok: result.ok, failedSelectorIds: result.failedSelectorIds };
  },

  selfTestFeed(root): SelectorCheckResult {
    const result = runFeedSelfTest(root);
    return { ok: result.ok, failedSelectorIds: result.failedSelectorIds };
  },

  readProfileStats(root): ProfileStats | null {
    try {
      const joinDateElement = firstMatch(root, getEntry('profile-join-date'));
      const postCountElement = firstMatch(root, getEntry('profile-post-count'));
      if (!joinDateElement && !postCountElement) return null;

      const handleAnchor = firstMatch(root, getEntry('author-handle'))?.closest(
        '[data-testid="User-Name"], [data-testid="UserName"]',
      );
      if (!handleAnchor) return null;
      const handle = Array.from(handleAnchor.querySelectorAll('div[dir="ltr"]'))
        .map(textOf)
        .find((value) => value.startsWith('@'));
      if (!handle) return null;

      let joinDate: number | null = null;
      const datetime = joinDateElement?.getAttribute('datetime');
      if (datetime) {
        const parsed = Date.parse(datetime);
        if (Number.isFinite(parsed)) joinDate = parsed;
      }
      if (joinDate === null) {
        const joinText = joinDateElement ? textOf(joinDateElement) : '';
        const match = joinText.match(PROFILE_JOIN_DATE_RE);
        if (match) {
          const parsed = Date.parse(`${match[1]} ${match[2]}`);
          if (Number.isFinite(parsed)) joinDate = parsed;
        }
      }

      const postCountText = postCountElement ? textOf(postCountElement) : '';
      const countMatch = postCountText.match(PROFILE_POST_COUNT_RE);
      const postCount = countMatch ? parseCompactCount(countMatch[1] ?? null) : null;

      return { handle, joinDate, postCount };
    } catch {
      return null;
    }
  },
};
