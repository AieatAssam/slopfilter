import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { getEntry, resolveSelector } from '@/adapters/x/selectors';

const fixtureDirectory = 'tests/fixtures/dom/x';
const postFixturePath = 'tests/fixtures/posts/posts-baseline.json';
const fixtureNames = [
  'timeline-baseline.html',
  'timeline-high-frequency.html',
  'timeline-broken-selectors.html',
] as const;

const readFixture = (name: (typeof fixtureNames)[number]): string =>
  readFileSync(`${fixtureDirectory}/${name}`, 'utf8');

const loadDocument = (html: string): Document => {
  document.documentElement.innerHTML = html;
  return document;
};

const postCount = (html: string): number => {
  const selector = getEntry('post-article').selectors[0];
  if (!selector) throw new Error('post-article selector missing');
  return loadDocument(html).querySelectorAll(selector).length;
};

describe('golden fixtures', () => {
  test('the baseline fixture contains at least three post elements', () => {
    expect(postCount(readFixture('timeline-baseline.html'))).toBeGreaterThanOrEqual(3);
  });

  test('no fixture contains a script tag or an inline event handler', () => {
    for (const name of fixtureNames) {
      const html = readFixture(name);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });

  test('no fixture references a host other than example.invalid', () => {
    for (const name of fixtureNames) {
      const urls = readFixture(name).match(/https?:\/\/([^/\s"'<>]+)/gi) ?? [];
      expect(urls.map((url) => new URL(url).hostname)).toEqual(urls.map(() => 'example.invalid'));
    }
  });

  test('posts-baseline.json matches the baseline fixture post count', () => {
    const posts = JSON.parse(readFileSync(postFixturePath, 'utf8')) as unknown[];
    expect(posts).toHaveLength(postCount(readFixture('timeline-baseline.html')));
  });

  test('every posts-baseline entry has a non-empty id, handle, and text', () => {
    const posts = JSON.parse(readFileSync(postFixturePath, 'utf8')) as Array<
      Record<string, unknown>
    >;
    for (const post of posts) {
      expect(typeof post.id).toBe('string');
      expect(post.id).not.toBe('');
      expect(typeof post.handle).toBe('string');
      expect(post.handle).not.toBe('');
      expect(typeof post.text).toBe('string');
      expect(post.text).not.toBe('');
    }
  });

  test('the broken fixture fails the timeline-container selector while the baseline passes', () => {
    const entry = getEntry('timeline-container');
    expect(
      resolveSelector(loadDocument(readFixture('timeline-baseline.html')), entry),
    ).not.toBeNull();
    expect(
      resolveSelector(loadDocument(readFixture('timeline-broken-selectors.html')), entry),
    ).toBeNull();
  });
});
