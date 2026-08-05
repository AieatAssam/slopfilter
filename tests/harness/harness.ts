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
    <div data-testid="User-Name"><a href="/${post.id}">${post.authorHandle}</a></div>
    <div data-testid="tweetText"></div>
    <time datetime="${post.postedAt}"></time>
  `;
  article.querySelector('[data-testid="tweetText"]')?.append(post.text);
  container.append(article);
};

const reset = () => {
  for (const post of document.querySelectorAll('[data-harness-appended="true"]')) post.remove();
};

window.__slopfilterHarness = { appendPost, reset };
