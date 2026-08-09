import type { Post } from '@/core/post';
import type { LayerId, ScoreBreakdown, ScoreContribution } from '@/core/scoring/types';
import { LAYER_IDS } from '@/storage/settings';

const dialogTestId = 'slopfilter-inspector';
const rowTestId = 'slopfilter-inspector-row';
const factsTestId = 'slopfilter-inspector-facts';
const totalsTestId = 'slopfilter-inspector-totals';

const renderValue = (value: number | string | boolean | null): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return fixed(value);
};

const fixed = (value: number | null | undefined, digits = 2): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
};

const fieldText = (values: Readonly<Record<string, number | string | boolean | null>>): string =>
  Object.entries(values)
    .map(([key, value]) => `${key}: ${renderValue(value)}`)
    .join(' · ');

const layerRow = (
  layerId: LayerId,
  contribution: ScoreContribution | undefined,
  enabled: boolean,
): HTMLElement => {
  const row = document.createElement('div');
  row.className = 'slopfilter-inspector-row';
  row.dataset.testid = rowTestId;
  const enabledText = enabled ? 'enabled' : 'disabled';
  const status = enabled ? (contribution?.detail?.status ?? 'unavailable') : 'disabled';
  const parts = [
    layerId,
    enabledText,
    status,
    `raw ${fixed(contribution?.score)}`,
    `weight ${fixed(contribution?.weight)}`,
    `contribution ${fixed(contribution?.weighted)}`,
  ];
  if (contribution?.reason) parts.push(contribution.reason);
  if (contribution?.detail?.values) parts.push(fieldText(contribution.detail.values));
  row.textContent = parts.join(' · ');
  row.dataset.layer = layerId;
  row.dataset.status = status;
  return row;
};

const factRow = (label: string, value: string): HTMLElement => {
  const row = document.createElement('div');
  row.className = 'slopfilter-inspector-fact';
  row.textContent = `${label}: ${value}`;
  return row;
};

export interface InspectorOptions {
  breakdown: ScoreBreakdown;
  enabledLayers: Record<LayerId, boolean>;
}

export const openInspector = (post: Post, options: InspectorOptions): void => {
  const { breakdown } = options;

  const dialog = document.createElement('dialog');
  dialog.className = 'slopfilter-inspector';
  dialog.dataset.testid = dialogTestId;
  dialog.setAttribute('aria-label', 'Score details for this post');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'slopfilter-inspector-close';
  close.textContent = 'Close';
  close.dataset.testid = 'slopfilter-inspector-close';
  close.setAttribute('aria-label', 'Close inspector');

  const title = document.createElement('p');
  title.className = 'slopfilter-inspector-title';
  title.textContent = 'Score details';

  const facts = document.createElement('div');
  facts.className = 'slopfilter-inspector-facts';
  facts.dataset.testid = factsTestId;
  facts.append(
    factRow('Post id', post.id),
    factRow('Handle', post.author.handle),
    factRow('Posted at', post.postedAt ?? 'unknown'),
    factRow('Text length', String(post.text.length)),
    factRow('Images', String(post.imageUrls.length)),
    factRow(
      'Engagement',
      `likes ${fixed(post.engagement.likes, 0)} · reposts ${fixed(post.engagement.reposts, 0)} · replies ${fixed(post.engagement.replies, 0)} · views ${fixed(post.engagement.views, 0)}`,
    ),
  );

  const rows = document.createElement('div');
  rows.className = 'slopfilter-inspector-layers';
  for (const layerId of LAYER_IDS) {
    const contribution = breakdown.contributions.find((entry) => entry.layerId === layerId);
    rows.append(layerRow(layerId, contribution, options.enabledLayers[layerId]));
  }

  const totals = document.createElement('div');
  totals.className = 'slopfilter-inspector-totals';
  totals.dataset.testid = totalsTestId;
  const totalWeight = breakdown.totalWeight ?? 0;
  const requiredDelta =
    breakdown.requiredDelta ?? Math.max(0, breakdown.threshold - breakdown.compositeScore);
  const verdict = breakdown.hidden ? 'hidden' : 'showed';
  totals.textContent = `Composite ${fixed(breakdown.compositeScore)} · total weight ${fixed(totalWeight)} · threshold ${fixed(breakdown.threshold)} · verdict ${verdict} · shortfall ${fixed(requiredDelta)}`;

  dialog.append(title, facts, rows, totals, close);
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
    close.addEventListener('click', () => dialog.close());
  } else {
    dialog.setAttribute('open', '');
  }
};
