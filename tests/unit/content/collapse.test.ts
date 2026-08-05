import { beforeEach, describe, expect, test } from 'vitest';
import { collapsePost } from '@/content/collapse';
import type { ScoreBreakdown } from '@/core/scoring/types';

const breakdown = (reasons: string[]): ScoreBreakdown => ({
  compositeScore: 1,
  threshold: 0.6,
  hidden: true,
  contributions: [],
  reasons,
});

const setup = (): HTMLElement => {
  document.body.innerHTML = '<main><article data-testid="tweet">post body</article></main>';
  const post = document.querySelector('article');
  if (!(post instanceof HTMLElement)) throw new Error('post missing');
  return post;
};

describe('collapsePost', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('hides the original element and inserts a placeholder sibling', () => {
    const post = setup();

    collapsePost(post, breakdown(['posts 40+ times per day']));

    expect(document.body.contains(post)).toBe(true);
    expect(post.style.display).toBe('none');
    expect(post.nextElementSibling?.getAttribute('data-testid')).toBe('slopfilter-placeholder');
  });

  test('renders the breakdown reasons verbatim', () => {
    const post = setup();

    collapsePost(
      post,
      breakdown(['posts 40+ times per day', 'high views, very little engagement']),
    );

    expect(post.nextElementSibling?.textContent).toContain(
      'Hidden: posts 40+ times per day · high views, very little engagement',
    );
  });

  test('show anyway restores the original post', () => {
    const post = setup();
    collapsePost(post, breakdown(['observable evidence']));
    const button = post.nextElementSibling?.querySelector('.slopfilter-show-anyway');
    if (!(button instanceof HTMLButtonElement)) throw new Error('show anyway button missing');

    button.click();

    expect(post.style.display).toBe('');
    expect(document.querySelector('[data-testid="slopfilter-placeholder"]')).toBeNull();
  });

  test('is idempotent', () => {
    const post = setup();
    const reasons = breakdown(['observable evidence']);

    collapsePost(post, reasons);
    collapsePost(post, reasons);

    expect(document.querySelectorAll('[data-testid="slopfilter-placeholder"]')).toHaveLength(1);
  });

  test('never renders an authorship claim', () => {
    const post = setup();
    collapsePost(post, breakdown(['posts 40+ times per day']));

    expect(post.nextElementSibling?.textContent).not.toMatch(
      /\b(ai|generated|synthetic|authored)\b/i,
    );
  });
});
