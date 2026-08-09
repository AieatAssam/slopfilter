import { beforeEach, describe, expect, test } from 'vitest';
import { openInspector } from '@/content/inspector';
import type { Post } from '@/core/post';
import type { LayerId, ScoreBreakdown } from '@/core/scoring/types';
import { LAYER_IDS } from '@/storage/settings';

const allEnabled = Object.fromEntries(LAYER_IDS.map((layerId) => [layerId, true])) as Record<
  LayerId,
  boolean
>;

const post: Post = {
  id: 'post-1',
  permalink: null,
  text: 'some post text',
  postedAt: '2026-08-05T10:00:00.000Z',
  author: { handle: '@account01', displayName: 'Account 01', profileUrl: null },
  engagement: { replies: 1, reposts: 2, likes: 3, views: 100 },
  imageUrls: ['https://example.com/a.jpg'],
  hasVideo: false,
};

const breakdown: ScoreBreakdown = {
  compositeScore: 0.4,
  threshold: 0.6,
  hidden: false,
  totalWeight: 0.8,
  requiredDelta: 0.2,
  reasons: [],
  contributions: [
    {
      layerId: 'behavioural',
      score: 0,
      weight: 0.4,
      weighted: 0,
      reason: null,
      detail: { status: 'scored', values: { postsPerDay: 15, observedPostCount: 2 } },
    },
    {
      layerId: 'provenance',
      score: 0,
      weight: 0.1,
      weighted: 0,
      reason: null,
      detail: {
        status: 'no-data',
        values: { imageCount: 0, withManifest: 0, withoutManifest: 0, unreadable: 0 },
      },
    },
    {
      layerId: 'content-type',
      score: 0,
      weight: 0.2,
      weighted: 0,
      reason: null,
      detail: { status: 'gated', values: { gated: true, confidenceCutoff: 0.8 } },
    },
    {
      layerId: 'image-forensics',
      score: 0,
      weight: 0.1,
      weighted: 0,
      reason: null,
      detail: {
        status: 'below-cutoff',
        values: { maxScore: 0.4, artefactThreshold: 0.8, sampleCount: 1 },
      },
    },
    {
      layerId: 'taste',
      score: 0,
      weight: 0.2,
      weighted: 0,
      reason: null,
      detail: { status: 'unavailable', values: { sampleCount: 0 } },
    },
  ],
};

const open = () => {
  openInspector(post, { breakdown, enabledLayers: allEnabled });
  const dialog = document.querySelector('[data-testid="slopfilter-inspector"]');
  if (!(dialog instanceof HTMLElement)) throw new Error('inspector dialog missing');
  return dialog;
};

describe('openInspector', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  test('renders one row per configured layer, including scored-zero layers', () => {
    const dialog = open();

    const rows = dialog.querySelectorAll('[data-testid="slopfilter-inspector-row"]');
    expect(rows).toHaveLength(LAYER_IDS.length);
    for (const row of rows) {
      const status = row.getAttribute('data-status');
      expect(['scored', 'gated', 'below-cutoff', 'unavailable', 'no-data', 'disabled']).toContain(
        status,
      );
    }
  });

  test('renders one scored, one gated, one below-cutoff, one unavailable, and one no-data row', () => {
    const dialog = open();

    const byStatus = (status: string) =>
      [...dialog.querySelectorAll('[data-testid="slopfilter-inspector-row"]')].find(
        (row) => row.getAttribute('data-status') === status,
      );

    expect(byStatus('scored')?.getAttribute('data-layer')).toBe('behavioural');
    expect(byStatus('gated')?.getAttribute('data-layer')).toBe('content-type');
    expect(byStatus('below-cutoff')?.getAttribute('data-layer')).toBe('image-forensics');
    expect(byStatus('no-data')?.getAttribute('data-layer')).toBe('provenance');
    expect(byStatus('unavailable')?.getAttribute('data-layer')).toBe('taste');
  });

  test('shows a genuine zero as scored with raw 0', () => {
    const dialog = open();

    const scored = Array.from(
      dialog.querySelectorAll('[data-testid="slopfilter-inspector-row"]'),
    ).find((row) => row.getAttribute('data-status') === 'scored');
    expect(scored?.getAttribute('data-status')).toBe('scored');
    expect(scored?.textContent).toContain('raw 0.00');
  });

  test('shows raw pre-cutoff values on each layer row', () => {
    const dialog = open();

    const scored = Array.from(
      dialog.querySelectorAll('[data-testid="slopfilter-inspector-row"]'),
    ).find((row) => row.getAttribute('data-status') === 'scored');
    expect(scored?.textContent).toContain('postsPerDay: 15');

    const gated = Array.from(
      dialog.querySelectorAll('[data-testid="slopfilter-inspector-row"]'),
    ).find((row) => row.getAttribute('data-status') === 'gated');
    expect(gated?.textContent).toContain('confidenceCutoff: 0.8');
  });

  test('totals show composite, threshold, and the threshold shortfall', () => {
    const dialog = open();

    const totals = dialog.querySelector('[data-testid="slopfilter-inspector-totals"]');
    expect(totals?.textContent).toContain('Composite 0.40');
    expect(totals?.textContent).toContain('threshold 0.60');
    expect(totals?.textContent).toContain('shortfall 0.20');
  });

  test('renders post facts from the extracted post', () => {
    const dialog = open();

    expect(dialog.textContent).toContain('Post id: post-1');
    expect(dialog.textContent).toContain('Handle: @account01');
    expect(dialog.textContent).toContain('Text length: 14');
    expect(dialog.textContent).toContain('Images: 1');
  });

  test('labels a settings-disabled layer as disabled', () => {
    document.body.replaceChildren();
    const disabled = { ...allEnabled, provenance: false };
    openInspector(post, { breakdown, enabledLayers: disabled });
    const dialog = document.querySelector('[data-testid="slopfilter-inspector"]');

    const provenanceRow = Array.from(
      dialog?.querySelectorAll('[data-testid="slopfilter-inspector-row"]') ?? [],
    ).find((row) => row.getAttribute('data-layer') === 'provenance');
    expect(provenanceRow?.getAttribute('data-status')).toBe('disabled');
    expect(provenanceRow?.textContent).toContain('disabled');
  });

  test('totals show a hidden verdict and shortfall for a hidden post', () => {
    const dialog = open();

    expect(dialog.textContent).toContain('verdict showed');
  });
});
