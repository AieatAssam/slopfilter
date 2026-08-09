import type { Post } from '@/core/post';
import type { SignalResult } from '@/core/scoring/types';
import { DEFAULT_SCORING_CONFIG } from '@/core/scoring/weights';

export interface CalibrationRow {
  id: string;
  hide: boolean;
  derivation: string;
  signals: readonly SignalResult[];
  post: Post;
}

const post = (id: string, handle = '@calibration'): Post => ({
  id,
  permalink: null,
  text: 'calibration post',
  postedAt: '2026-08-05T10:00:00.000Z',
  author: { handle, displayName: 'Calibration', profileUrl: null },
  engagement: { replies: 0, reposts: 0, likes: 0, views: 1000 },
  imageUrls: [],
  hasVideo: false,
});

export const CALIBRATION_CONFIG = DEFAULT_SCORING_CONFIG;

export const CALIBRATION_ROWS: readonly CalibrationRow[] = [
  {
    id: 'spam-behavioural-hides',
    hide: true,
    derivation:
      'behavioural 1.0 * 0.6 = 0.6 >= 0.6 hides. The models report zero (content-type 0, taste 0, image-forensics 0), and under the additive sum they no longer dilute the loud layer.',
    signals: [
      { layerId: 'behavioural', ok: true, score: 1, reason: 'posts 80+ times per day' },
      { layerId: 'content-type', ok: true, score: 0, reason: null },
      { layerId: 'taste', ok: true, score: 0, reason: null },
      { layerId: 'image-forensics', ok: true, score: 0, reason: null },
    ],
    post: post('cal-1'),
  },
  {
    id: 'all-zero-stays-visible',
    hide: false,
    derivation:
      'Every layer scores 0, so the additive composite is 0.0 < 0.6 and the post stays visible.',
    signals: [
      { layerId: 'behavioural', ok: true, score: 0, reason: null },
      { layerId: 'content-type', ok: true, score: 0, reason: null },
      { layerId: 'taste', ok: true, score: 0, reason: null },
      { layerId: 'image-forensics', ok: true, score: 0, reason: null },
      { layerId: 'provenance', ok: true, score: 0, reason: null },
    ],
    post: post('cal-2'),
  },
  {
    id: 'classifier-plus-behavioural-hides',
    hide: true,
    derivation:
      'content-type 0.95 * 0.5 = 0.475 plus behavioural 0.3 * 0.6 = 0.18 totals 0.655 >= 0.6. A strong classifier result with weak behavioural evidence hides.',
    signals: [
      { layerId: 'behavioural', ok: true, score: 0.3, reason: null },
      { layerId: 'content-type', ok: true, score: 0.95, reason: 'engagement bait content' },
    ],
    post: post('cal-3'),
  },
  {
    id: 'classifier-alone-visible',
    hide: false,
    derivation:
      'content-type 0.95 * 0.5 = 0.475 < 0.6. A strong classifier result on its own is not enough to hide.',
    signals: [
      { layerId: 'content-type', ok: true, score: 0.95, reason: 'engagement bait content' },
    ],
    post: post('cal-4'),
  },
  {
    id: 'taste-alone-does-not-hide',
    hide: false,
    derivation:
      'taste 0.9 * 0.5 = 0.45 < 0.6. Similarity to a downvoted cluster is capped by its weight, so it cannot hide the post on its own.',
    signals: [{ layerId: 'taste', ok: true, score: 0.9, reason: null }],
    post: post('cal-5'),
  },
  {
    id: 'all-unavailable-stays-visible',
    hide: false,
    derivation:
      'Every layer reports ok:false, so no contribution reaches the composite and the post stays visible (fail open).',
    signals: [
      { layerId: 'behavioural', ok: false, score: 0, reason: null },
      { layerId: 'content-type', ok: false, score: 0, reason: null },
      { layerId: 'taste', ok: false, score: 0, reason: null },
      { layerId: 'image-forensics', ok: false, score: 0, reason: null },
      { layerId: 'provenance', ok: false, score: 0, reason: null },
    ],
    post: post('cal-6'),
  },
];
