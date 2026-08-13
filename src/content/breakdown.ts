import type { ScoreBreakdown } from '@/core/scoring/types';

const panelTestId = 'slopfilter-breakdown-panel';
const rowTestId = 'slopfilter-breakdown-row';

const value = (number: number): string => number.toFixed(2);
const TEXT_PATTERN_MODEL = 'trentmkelly/slop-detector-mini-2';
const TEXT_PATTERN_DATASET = 'slop-detector-mini-2';
const TEXT_PATTERN_CAVEAT =
  'Statistical text-pattern score; unreliable on short posts and biased against non-native English writing.';

export function attachBreakdown(placeholder: HTMLElement, breakdown: ScoreBreakdown): void {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'slopfilter-breakdown-toggle';
  toggle.textContent = 'Why was this hidden?';
  toggle.dataset.testid = 'slopfilter-breakdown-toggle';
  toggle.setAttribute('aria-expanded', 'false');

  toggle.addEventListener('click', () => {
    const existing = placeholder.querySelector(`[data-testid="${panelTestId}"]`);
    if (existing) {
      existing.remove();
      toggle.setAttribute('aria-expanded', 'false');
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'slopfilter-breakdown-panel';
    panel.dataset.testid = panelTestId;
    for (const contribution of breakdown.contributions) {
      const row = document.createElement('div');
      row.className = 'slopfilter-breakdown-row';
      row.dataset.testid = rowTestId;
      row.textContent = `${contribution.layerId}: score ${value(contribution.score)} · weight ${value(contribution.weight)} · contribution ${value(contribution.weighted)}`;
      if (contribution.layerId === 'text-pattern') {
        row.textContent += ` · model ${TEXT_PATTERN_MODEL} · dataset ${TEXT_PATTERN_DATASET} · ${TEXT_PATTERN_CAVEAT}`;
      }
      panel.append(row);
    }

    const summary = document.createElement('div');
    summary.className = 'slopfilter-breakdown-row';
    summary.dataset.testid = rowTestId;
    summary.textContent = `Composite: ${value(breakdown.compositeScore)} · threshold ${value(breakdown.threshold)}`;
    panel.append(summary);
    placeholder.append(panel);
    toggle.setAttribute('aria-expanded', 'true');
  });

  placeholder.append(toggle);
}
