import type { ScoreBreakdown } from '@/core/scoring/types';
import { attachBreakdown } from './breakdown';
import { type ContentTheme, themeClass } from './themes';

const placeholderTestId = 'slopfilter-placeholder';

export function collapsePost(
  element: HTMLElement,
  breakdown: ScoreBreakdown,
  theme: ContentTheme = 'generic',
  onRestored?: () => void,
): void {
  if (element.dataset.slopfilterCollapsed === 'true') return;

  element.dataset.slopfilterCollapsed = 'true';
  element.style.display = 'none';

  // A post that was visible gets its feedback controls attached to the article. Once it is hidden
  // the placeholder becomes the sole holder, so the article's controls must go too: otherwise both
  // mount a menu with the same slopfilter-menu-<postId> id and popovertarget resolves to the first
  // (hidden) one, opening a popover over a zero-sized element.
  const staleAnchor = element.querySelector<HTMLElement>('[data-testid="slopfilter-anchor"]');
  staleAnchor?.remove();

  const placeholder = document.createElement('div');
  placeholder.className = `slopfilter-placeholder ${themeClass(theme)}`;
  placeholder.dataset.testid = placeholderTestId;

  const reason = document.createElement('span');
  reason.className = 'slopfilter-reason';
  reason.textContent = `Hidden: ${breakdown.reasons.join(' · ')}`;

  attachBreakdown(placeholder, breakdown);

  const showAnyway = document.createElement('button');
  showAnyway.className = 'slopfilter-show-anyway';
  showAnyway.type = 'button';
  showAnyway.textContent = 'Show anyway';
  showAnyway.addEventListener('click', () => {
    restorePost(element);
    onRestored?.();
  });

  placeholder.append(reason, showAnyway);
  element.after(placeholder);
}

export function restorePost(element: HTMLElement): void {
  delete element.dataset.slopfilterCollapsed;
  element.style.display = '';
  const placeholder = element.nextElementSibling;
  if (placeholder?.getAttribute('data-testid') === placeholderTestId) placeholder.remove();
}
