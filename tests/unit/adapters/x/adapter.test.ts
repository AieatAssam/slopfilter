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

  test('finds the post content column for inline controls', () => {
    const container = xAdapter.findTimelineContainer(loadBaseline());
    const article = container ? xAdapter.findPostElements(container)[0] : null;
    const column = article ? xAdapter.findPostContentColumn?.(article) : null;

    expect(column).not.toBeNull();
    expect(column?.querySelector('[data-testid="tweetText"]')).not.toBeNull();
    expect(column?.parentElement?.children.length).toBe(2);
  });

  test('uses the author and text common column on detail layouts', () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div class="detail-layout">
          <div data-testid="sidebar"></div>
          <div data-testid="content-column">
            <div data-testid="User-Name"><div dir="ltr">Account</div><div dir="ltr">@account</div></div>
            <div data-testid="tweetText">A detail post.</div>
          </div>
          <div data-testid="actions"></div>
        </div>
      </article>
    `;
    const article = document.querySelector('article');
    const column = article ? xAdapter.findPostContentColumn?.(article) : null;

    expect(column?.getAttribute('data-testid')).toBe('content-column');
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

  test('extracts a full article using the current UserName wrapper', () => {
    const container = xAdapter.findTimelineContainer(loadBaseline());
    const article = container ? xAdapter.findPostElements(container)[0] : null;
    const author = article?.querySelector('[data-testid="User-Name"]');
    if (!article || !author) throw new Error('baseline article missing');
    author.setAttribute('data-testid', 'UserName');

    expect(xAdapter.extractPost(article)?.author.handle).toBe(expectedPosts[0]?.handle);
  });

  test('recognises the visible Ad label without matching post text', () => {
    const container = xAdapter.findTimelineContainer(loadBaseline());
    if (!container) throw new Error('timeline container missing');
    const posts = xAdapter
      .findPostElements(container)
      .map((element) => xAdapter.extractPost(element));

    expect(posts.filter((post) => post?.isAd)).toHaveLength(2);
    expect(posts.filter((post) => !post?.isAd)).toHaveLength(7);
  });

  test('returns null for an unparseable article instead of throwing', () => {
    expect(() => xAdapter.extractPost(document.createElement('article'))).not.toThrow();
    expect(xAdapter.extractPost(document.createElement('article'))).toBeNull();
  });

  test('reads the current profile header metadata shape', () => {
    document.body.innerHTML = `
      <div data-testid="UserName"><div dir="ltr">DHH</div><div dir="ltr">@dhh</div></div>
      <h2 role="heading">DHH</h2><div dir="ltr">70.9K posts</div>
      <div data-testid="UserProfileHeader_Items">
        <a data-testid="UserJoinDate" href="/dhh/about"><span>Joined April 2008</span></a>
      </div>
    `;

    expect(xAdapter.readProfileStats?.(document)).toEqual({
      handle: '@dhh',
      joinDate: Date.parse('April 2008'),
      postCount: 70900,
    });
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

describe('x adapter post text keeps emoji', () => {
  test('reads an emoji rendered as an img alt inside the post text', () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name"><div dir="ltr">Account</div><div dir="ltr">@account</div></div>
        <a href="/account/status/12345">permalink</a>
        <div data-testid="tweetText"><span>Read this </span><img alt="🧵" /><span> now</span></div>
      </article>
    `;
    const article = document.querySelector('article');
    if (!article) throw new Error('article missing');

    expect(xAdapter.extractPost(article)?.text).toBe('Read this 🧵 now');
  });
});
