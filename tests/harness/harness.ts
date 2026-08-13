import { xAdapter } from '@/adapters/x/adapter';
import { collapsePost, restorePost } from '@/content/collapse';
import { attachFeedbackControls } from '@/content/feedback';
import type { ScoreBreakdown } from '@/core/scoring/types';

const GOLDEN_FIXTURE_URL = '/fixtures/dom/x/timeline-baseline.html';

const mountGolden = async () => {
  const response = await fetch(GOLDEN_FIXTURE_URL);
  if (!response.ok) throw new Error(`golden fixture fetch failed: ${response.status}`);
  const html = await response.text();
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.replaceChildren(...Array.from(parsed.body.childNodes));
  // Captured X articles carry no id attribute, so stamp one per article for layoutVariantIds.
  const mounted = document.body.querySelectorAll<HTMLElement>('article[data-testid="tweet"]');
  mounted.forEach((article, index) => {
    if (!article.id) article.id = `sf-golden-post-${index}`;
  });
};

const layoutVariantIds = (): string[] => {
  const articles = Array.from(
    document.body.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
  );
  const hasPhoto = (article: HTMLElement) =>
    Boolean(article.querySelector('[data-testid="tweetPhoto"]'));
  const byHeight = (a: HTMLElement, b: HTMLElement) => a.offsetHeight - b.offsetHeight;
  const shortText = articles.filter((article) => !hasPhoto(article)).sort(byHeight)[0];
  const firstPhoto = articles.filter(hasPhoto).sort(byHeight)[0];
  const tall = articles
    .filter((article) => article !== shortText && article !== firstPhoto)
    .sort(byHeight)
    .at(-1);
  const chosen = [shortText, firstPhoto, tall].filter((article): article is HTMLElement =>
    Boolean(article),
  );
  return Array.from(new Set(chosen.map((article) => article.id)));
};

const THEMES: Record<'default' | 'dim' | 'lights-out', { background: string; text: string }> = {
  default: { background: 'rgb(255, 255, 255)', text: 'rgb(15, 20, 25)' },
  dim: { background: 'rgb(21, 32, 43)', text: 'rgb(247, 249, 249)' },
  'lights-out': { background: 'rgb(0, 0, 0)', text: 'rgb(231, 233, 234)' },
};

const setTheme = (theme: 'default' | 'dim' | 'lights-out') => {
  const value = THEMES[theme];
  document.body.style.backgroundColor = value.background;
  const timelineEl = document.querySelector('[aria-label="Timeline: Your Home Timeline"]');
  if (timelineEl instanceof HTMLElement) timelineEl.style.color = value.text;
};

const setAccent = (color: string) => {
  let probe = document.querySelector<HTMLElement>('[data-testid="tweetButtonInline"]');
  if (!probe) {
    probe = document.createElement('div');
    probe.dataset.testid = 'tweetButtonInline';
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    if (!primary) throw new Error('primary column not found');
    primary.appendChild(probe);
  }
  probe.style.backgroundColor = color;
};

const applyFixtureVariant = async () => {
  const fixture = new URLSearchParams(location.search).get('fixture');
  if (fixture === 'golden') {
    await mountGolden();
    return;
  }
  if (fixture === 'high-frequency') {
    const section = document.querySelector('main[data-testid="primaryColumn"] section');
    if (!section) throw new Error('timeline section not found');
    const posts = Array.from({ length: 10 }, (_, index) => {
      const article = document.createElement('article');
      article.dataset.postId = `high-frequency-${index}`;
      article.dataset.testid = 'tweet';
      article.innerHTML = `
        <div data-testid="User-Name">
          <div dir="ltr">Account 01</div>
          <div dir="ltr"><a href="/account01/status/high-frequency-${index}">@account01</a></div>
        </div>
        <div data-testid="tweetText">High-frequency post ${index + 1}.</div>
        <time datetime="${new Date(Date.parse('2026-08-05T10:00:00.000Z') - index * 8 * 60_000).toISOString()}"></time>
      `;
      return article;
    });
    section.replaceChildren(...posts);
    return;
  }
  if (fixture === 'engagement-popular') {
    const section = document.querySelector('main[data-testid="primaryColumn"] section');
    if (!section) throw new Error('timeline section not found');
    section.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name">
          <div dir="ltr">Popular account</div>
          <div dir="ltr"><a href="/popular/status/popular-0">@popular</a></div>
        </div>
        <div data-testid="tweetText">Earlier popular post.</div>
        <time datetime="2026-08-05T09:00:00.000Z"></time>
      </article>
      <article data-testid="tweet">
        <div data-testid="User-Name">
          <div dir="ltr">Popular account</div>
          <div dir="ltr"><a href="/popular/status/popular-1">@popular</a></div>
        </div>
        <div data-testid="tweetText">Popular post with meaningful engagement.</div>
        <time datetime="2026-08-05T10:00:00.000Z"></time>
        <button data-testid="like" aria-label="500 Likes. Like"></button>
        <button data-testid="retweet" aria-label="10 reposts. Repost"></button>
        <a href="/popular/status/popular-1/analytics" aria-label="1000000 views. View post analytics"></a>
      </article>
    `;
    return;
  }
  if (fixture === 'advertisement') {
    const section = document.querySelector('main[data-testid="primaryColumn"] section');
    if (!section) throw new Error('timeline section not found');
    section.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name">
          <div dir="ltr">Advertiser</div>
          <div dir="ltr"><a href="/advertiser/status/ad-1">@advertiser</a></div>
        </div>
        <div><div dir="ltr"><span>Ad</span></div></div>
        <div data-testid="tweetText">A promoted post.</div>
        <a href="/advertiser/status/ad-1">10% off today</a>
        <time datetime="2026-08-05T10:00:00.000Z"></time>
      </article>
    `;
    return;
  }
  if (fixture !== 'broken') return;
  const section = document.querySelector('main[data-testid="primaryColumn"] section');
  if (!section?.parentNode) throw new Error('timeline section not found');
  section.removeAttribute('aria-label');
  while (section.firstChild) section.parentNode.insertBefore(section.firstChild, section);
  section.remove();
};

type HarnessPost = {
  id: string;
  authorHandle: string;
  text: string;
  postedAt: string;
  imageUrl?: string;
  // SF-216: compact-count controls as X renders them, so the payload-vs-DOM supersession is testable.
  engagement?: {
    likes?: string;
    reposts?: string;
    replies?: string;
    views?: string;
  };
};

const STORED_POSTS_KEY = 'slopfilter-harness-posts';

const timeline = () => document.querySelector('[aria-label="Timeline: Your Home Timeline"]');

const createPostElement = (post: HarnessPost): HTMLElement => {
  const article = document.createElement('article');
  article.dataset.postId = post.id;
  article.dataset.testid = 'tweet';
  article.dataset.harnessAppended = 'true';
  const { likes, reposts, replies, views } = post.engagement ?? {};
  article.innerHTML = `
    <div data-testid="User-Name">
      <div dir="ltr">Account</div>
      <div dir="ltr"><a href="/${post.authorHandle.slice(1)}/status/${post.id}">${post.authorHandle}</a></div>
    </div>
    <div data-testid="tweetText"></div>
    ${post.imageUrl ? `<div data-testid="tweetPhoto"><img alt="Benchmark image" src="${post.imageUrl}" /></div>` : ''}
    <time datetime="${post.postedAt}"></time>
    ${replies ? `<button data-testid="reply" aria-label="${replies} replies. Reply"></button>` : ''}
    ${reposts ? `<button data-testid="retweet" aria-label="${reposts} reposts. Repost"></button>` : ''}
    ${likes ? `<button data-testid="like" aria-label="${likes} Likes. Like"></button>` : ''}
    ${views ? `<a href="/${post.authorHandle.slice(1)}/status/${post.id}/analytics" aria-label="${views} views. View post analytics"></a>` : ''}
  `;
  article.querySelector('[data-testid="tweetText"]')?.append(post.text);
  return article;
};

const appendPost = (post: HarnessPost, persist = true) => {
  const container = timeline();
  if (!container) throw new Error('timeline container not found');
  container.append(createPostElement(post));
  if (persist) {
    const stored = JSON.parse(sessionStorage.getItem(STORED_POSTS_KEY) ?? '[]') as HarnessPost[];
    sessionStorage.setItem(STORED_POSTS_KEY, JSON.stringify([...stored, post]));
  }
};

const restoreAppendedPosts = () => {
  const stored = JSON.parse(sessionStorage.getItem(STORED_POSTS_KEY) ?? '[]') as HarnessPost[];
  if (!timeline()) return;
  for (const post of stored) appendPost(post, false);
};

const reset = () => {
  for (const post of document.querySelectorAll('[data-harness-appended="true"]')) post.remove();
  sessionStorage.removeItem(STORED_POSTS_KEY);
};

const collapseFirstPost = (reasons: string[]) => {
  const container = timeline();
  const post =
    container?.querySelector('article[data-harness-appended="true"]') ??
    container?.querySelector('article[data-testid="tweet"]');
  if (!(post instanceof HTMLElement)) throw new Error('post not found');

  const breakdown: ScoreBreakdown = {
    compositeScore: 1,
    threshold: 0.6,
    hidden: true,
    contributions: [],
    reasons,
  };
  collapsePost(post, breakdown);
};

const restoreArticle = (articleId: string) => {
  const article = document.getElementById(articleId);
  if (!(article instanceof HTMLElement)) throw new Error(`article not found: ${articleId}`);
  if (article.dataset.slopfilterCollapsed === 'true') restorePost(article);
};

const insertAnchoredFeedback = (articleId: string) => {
  const article = document.getElementById(articleId);
  if (!(article instanceof HTMLElement)) throw new Error(`article not found: ${articleId}`);
  const post = xAdapter.extractPost(article);
  if (!post) throw new Error(`post extraction failed: ${articleId}`);
  const breakdown: ScoreBreakdown = {
    compositeScore: 0.4,
    threshold: 0.6,
    hidden: false,
    contributions: [],
    reasons: [],
  };
  attachFeedbackControls(article, post, {
    breakdown,
    findAnchorHost: (element) => xAdapter.findPostContentColumn?.(element) ?? null,
  });
};

window.__slopfilterHarness = {
  appendPost,
  collapseFirstPost,
  restoreArticle,
  attachFeedback: insertAnchoredFeedback,
  reset,
  mountGolden,
  layoutVariantIds,
  setTheme,
  setAccent,
};

await applyFixtureVariant();

restoreAppendedPosts();
