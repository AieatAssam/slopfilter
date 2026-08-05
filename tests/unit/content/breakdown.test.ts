import { beforeEach, describe, expect, test } from 'vitest';
import { attachBreakdown } from '@/content/breakdown';
import type { ScoreBreakdown } from '@/core/scoring/types';

const breakdown: ScoreBreakdown = {
  compositeScore: 0.73,
  threshold: 0.6,
  hidden: true,
  contributions: [
    { layerId: 'behavioural', score: 0.8, weight: 0.7, weighted: 0.56, reason: 'frequency' },
    { layerId: 'taste', score: 0.4, weight: 0.3, weighted: 0.12, reason: 'taste' },
  ],
  reasons: ['frequency', 'taste'],
};

const setup = (): HTMLElement => {
  document.body.replaceChildren();
  const placeholder = document.createElement('div');
  document.body.append(placeholder);
  attachBreakdown(placeholder, breakdown);
  return placeholder;
};

describe('breakdown panel', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('is collapsed by default', () => {
    const placeholder = setup();

    expect(placeholder.querySelector('[data-testid="slopfilter-breakdown-panel"]')).toBeNull();
    expect(
      placeholder
        .querySelector('[data-testid="slopfilter-breakdown-toggle"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
  });

  test('expands on activation', () => {
    const placeholder = setup();
    const toggle = placeholder.querySelector('[data-testid="slopfilter-breakdown-toggle"]');
    if (!(toggle instanceof HTMLButtonElement)) throw new Error('breakdown toggle missing');

    toggle.click();

    expect(placeholder.querySelector('[data-testid="slopfilter-breakdown-panel"]')).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  test('lists every contributing layer once', () => {
    const placeholder = setup();
    const toggle = placeholder.querySelector('button');
    if (!(toggle instanceof HTMLButtonElement)) throw new Error('breakdown toggle missing');
    toggle.click();

    const rows = placeholder.querySelectorAll('[data-testid="slopfilter-breakdown-row"]');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('behavioural');
    expect(rows[1]?.textContent).toContain('taste');
  });

  test('displays the breakdown composite verbatim', () => {
    const placeholder = setup();
    placeholder.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(placeholder.textContent).toContain('Composite: 0.73 · threshold 0.60');
  });

  test('never renders an authorship claim', () => {
    const placeholder = setup();
    placeholder.querySelector('button')?.click();

    expect(placeholder.textContent).not.toMatch(/\b(ai|generated|synthetic|authored)\b/i);
  });
});
