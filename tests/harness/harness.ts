import { collapsePost } from '@/content/collapse';
import type { ScoreBreakdown } from '@/core/scoring/types';

const applyFixtureVariant = () => {
  const fixture = new URLSearchParams(location.search).get('fixture');
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
        <time datetime="${new Date(Date.parse('2026-08-05T10:00:00.000Z') - index * 1_800_000).toISOString()}"></time>
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
  if (fixture !== 'broken') return;
  const section = document.querySelector('main[data-testid="primaryColumn"] section');
  if (!section?.parentNode) throw new Error('timeline section not found');
  section.removeAttribute('aria-label');
  while (section.firstChild) section.parentNode.insertBefore(section.firstChild, section);
  section.remove();
};

applyFixtureVariant();

type HarnessPost = {
  id: string;
  authorHandle: string;
  text: string;
  postedAt: string;
};

const timeline = () => document.querySelector('[aria-label="Timeline: Your Home Timeline"]');

const appendPost = (post: HarnessPost) => {
  const container = timeline();
  if (!container) throw new Error('timeline container not found');

  const article = document.createElement('article');
  article.dataset.postId = post.id;
  article.dataset.testid = 'tweet';
  article.dataset.harnessAppended = 'true';
  article.innerHTML = `
    <div data-testid="User-Name">
      <div dir="ltr">Account</div>
      <div dir="ltr"><a href="/${post.authorHandle.slice(1)}/status/${post.id}">${post.authorHandle}</a></div>
    </div>
    <div data-testid="tweetText"></div>
    <time datetime="${post.postedAt}"></time>
  `;
  article.querySelector('[data-testid="tweetText"]')?.append(post.text);
  container.append(article);
};

const reset = () => {
  for (const post of document.querySelectorAll('[data-harness-appended="true"]')) post.remove();
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

window.__slopfilterHarness = { appendPost, collapseFirstPost, reset };
