import type { ScoreBreakdown } from '@/core/scoring/types';
import { attachBreakdown } from './breakdown';

const placeholderTestId = 'slopfilter-placeholder';

export function collapsePost(element: HTMLElement, breakdown: ScoreBreakdown): void {
  if (element.dataset.slopfilterCollapsed === 'true') return;

  element.dataset.slopfilterCollapsed = 'true';
  element.style.display = 'none';

  const placeholder = document.createElement('div');
  placeholder.className = 'slopfilter-placeholder';
  placeholder.dataset.testid = placeholderTestId;

  const reason = document.createElement('span');
  reason.className = 'slopfilter-reason';
  reason.textContent = `Hidden: ${breakdown.reasons.join(' · ')}`;

  attachBreakdown(placeholder, breakdown);

  const showAnyway = document.createElement('button');
  showAnyway.className = 'slopfilter-show-anyway';
  showAnyway.type = 'button';
  showAnyway.textContent = 'Show anyway';
  showAnyway.addEventListener('click', () => restorePost(element));

  placeholder.append(reason, showAnyway);
  element.after(placeholder);
}

export function restorePost(element: HTMLElement): void {
  delete element.dataset.slopfilterCollapsed;
  element.style.display = '';
  const placeholder = element.nextElementSibling;
  if (placeholder?.getAttribute('data-testid') === placeholderTestId) placeholder.remove();
}
