import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseCompactCount, xAdapter } from '@/adapters/x/adapter';
import { resolveSelector, selectorContract } from '@/adapters/x/selectors';
import { isPost } from '@/core/post';

const baseline = readFileSync('tests/fixtures/dom/x/timeline-baseline.html', 'utf8');
const expectedPosts = JSON.parse(
  readFileSync('tests/fixtures/posts/posts-baseline.json', 'utf8'),
) as Array<{ id: string; handle: string; text: string }>;

const loadBaseline = (): Document => {
  document.documentElement.innerHTML = baseline;
  return document;
};

describe('x adapter', () => {
  test('finds the timeline container in the baseline fixture', () => {
    expect(xAdapter.findTimelineContainer(loadBaseline())).not.toBeNull();
  });

  test('extracts exactly the recorded number of posts', () => {
    const container = xAdapter.findTimelineContainer(loadBaseline());
    if (!container) throw new Error('timeline container missing');
    expect(xAdapter.findPostElements(container)).toHaveLength(expectedPosts.length);
  });

  test('every extracted post satisfies isPost', () => {
    const container = xAdapter.findTimelineContainer(loadBaseline());
    if (!container) throw new Error('timeline container missing');
    for (const element of xAdapter.findPostElements(container)) {
      expect(isPost(xAdapter.extractPost(element))).toBe(true);
    }
  });

  test('extracts the recorded id, handle, and text for every baseline post', () => {
    const container = xAdapter.findTimelineContainer(loadBaseline());
    if (!container) throw new Error('timeline container missing');
    const actual = xAdapter.findPostElements(container).map((element) => {
      const post = xAdapter.extractPost(element);
      if (!post) throw new Error('post failed to parse');
      return { id: post.id, handle: post.author.handle, text: post.text };
    });
    expect(actual).toEqual(expectedPosts);
  });

  test('returns null for an unparseable article instead of throwing', () => {
    expect(() => xAdapter.extractPost(document.createElement('article'))).not.toThrow();
    expect(xAdapter.extractPost(document.createElement('article'))).toBeNull();
  });

  test('every declared required selector matches the baseline fixture', () => {
    const root = loadBaseline();
    for (const entry of selectorContract.entries.filter(({ required }) => required)) {
      expect(resolveSelector(root, entry), entry.id).not.toBeNull();
    }
  });
});

describe('parseCompactCount', () => {
  test.each([
    ['1.2K', 1200],
    ['3.4M', 3400000],
    ['1,234', 1234],
    ['0', 0],
    ['abc', null],
    ['', null],
  ])('%s parses as %s', (raw, expected) => {
    expect(parseCompactCount(raw)).toBe(expected);
  });
});
