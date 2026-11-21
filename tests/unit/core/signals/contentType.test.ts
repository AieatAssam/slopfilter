import { describe, expect, test } from 'vitest';
import { scorePost } from '@/core/scoring/pipeline';
import type { SignalResult } from '@/core/scoring/types';
import { CONTENT_FORMAT_DEFAULTS, DEFAULT_SCORING_CONFIG } from '@/core/scoring/weights';
import {
  CENTROID_SIMILARITY_THRESHOLD,
  CONTENT_TYPE_LABELS,
  CONTENT_TYPE_PROTOTYPES,
  combineContentType,
  scoreContentCentroid,
  scoreContentFormat,
} from '@/core/signals/contentType';
import {
  CONTENT_CENTROID_CONFIG,
  CONTENT_CENTROID_ROWS,
  CONTENT_CENTROID_VECTORS,
} from '../../../fixtures/posts/contentCentroid';
import { CONTENT_FORMAT_ROWS } from '../../../fixtures/posts/contentFormat';

const post = {
  id: 'post-1',
  permalink: null,
  text: 'post',
  postedAt: '2026-08-05T10:00:00.000Z',
  author: { handle: '@account01', displayName: 'Account 01', profileUrl: null },
  engagement: { replies: 0, reposts: 0, likes: 0, views: 1 },
  imageUrls: [],
  hasVideo: false,
};

describe('scoreContentFormat calibration', () => {
  test.each(CONTENT_FORMAT_ROWS)('$id reaches its documented outcome', (row) => {
    const result = scoreContentFormat(row.text, CONTENT_FORMAT_DEFAULTS);

    if (row.outcome === 'no-data') {
      expect(result.score).toBe(0);
      expect(result.reason).toBeNull();
      expect(result.detail?.status).toBe('no-data');
      return;
    }
    if (row.outcome === 'no-fire') {
      expect(result.score).toBe(0);
      expect(result.reason).toBeNull();
      return;
    }
    const fired = row.firedFeatures;
    const firedIds = Object.entries(result.detail?.values ?? {}).filter(
      ([key, value]) => value !== 0 && key !== 'firedFeatureCount',
    );
    expect(firedIds.map(([id]) => id).sort(), row.id).toEqual([...fired].sort());
    if (row.outcome === 'strong') {
      expect(result.score).toBeGreaterThanOrEqual(0.6);
    } else {
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(0.6);
    }
    expect(result.reason).not.toBeNull();
  });

  test('records the raw count of each fired feature in the detail', () => {
    const giveaway = CONTENT_FORMAT_ROWS[0];
    if (!giveaway) throw new Error('missing calibration row');
    const result = scoreContentFormat(giveaway.text, CONTENT_FORMAT_DEFAULTS);
    expect(result.detail?.values?.hashtagStuffing).toBe(8);
    expect(result.detail?.values?.callToAction).toBe(4);
    expect(result.detail?.values?.listRun).toBe(3);
  });

  test('a single maximal feature fire never crosses the hide threshold', () => {
    const result = scoreContentFormat(
      'Here is the full lineup for tonight: #draft #nba #highlights #news #scores #updates #recap #more',
      CONTENT_FORMAT_DEFAULTS,
    );
    const composite = result.score * DEFAULT_SCORING_CONFIG.weights['content-type'];

    expect(result.score).toBe(CONTENT_FORMAT_DEFAULTS.featureWeights.hashtagStuffing);
    expect(composite).toBeLessThan(DEFAULT_SCORING_CONFIG.hideThreshold);
  });

  test('the score is capped at the documented format cap', () => {
    const result = scoreContentFormat(CONTENT_FORMAT_ROWS[0]?.text ?? '', CONTENT_FORMAT_DEFAULTS);
    expect(result.score).toBe(CONTENT_FORMAT_DEFAULTS.scoreCap);
  });
});

describe('scoreContentCentroid calibration', () => {
  test('keeps the prototype table auditable and broad enough', () => {
    expect(CONTENT_TYPE_PROTOTYPES.map(({ label }) => label)).toEqual([...CONTENT_TYPE_LABELS]);
    for (const prototype of CONTENT_TYPE_PROTOTYPES) {
      expect(prototype.examples.length).toBeGreaterThanOrEqual(12);
      expect(prototype.note).not.toBe('');
      for (const example of prototype.examples) {
        expect(example.text).not.toBe('');
        expect(example.note).not.toBe('');
      }
    }
  });

  test.each(CONTENT_CENTROID_ROWS)('$id reaches its documented outcome', (row) => {
    const result = scoreContentCentroid(
      row.embedding,
      CONTENT_CENTROID_VECTORS,
      CONTENT_CENTROID_CONFIG,
    );
    if (row.outcome === 'no-data') {
      expect(result.detail?.status).toBe('no-data');
      expect(result.score).toBe(0);
      expect(result.reason).toBeNull();
      return;
    }
    if (row.outcome === 'below-cutoff') {
      expect(result.detail?.status).toBe('below-cutoff');
      expect(result.score).toBe(0);
      expect(result.reason).toBeNull();
      return;
    }
    expect(result.detail?.status).toBe('scored');
    expect(result.detail?.values?.winningLabel).toBe(row.outcome);
    expect(result.score).toBeGreaterThanOrEqual(CENTROID_SIMILARITY_THRESHOLD);
    expect(result.reason).not.toBeNull();
  });

  test('records every label cosine and fails open without an embedding', () => {
    const scored = scoreContentCentroid([1, 0, 0], CONTENT_CENTROID_VECTORS);
    expect(scored.detail?.values?.['engagement bait']).toBe(1);
    expect(scored.detail?.values?.['generic motivational content']).toBe(0);
    expect(scored.detail?.values?.['giveaway or crypto spam']).toBe(0);
    expect(scoreContentCentroid(null, CONTENT_CENTROID_VECTORS).detail?.status).toBe('no-data');
  });
});

describe('combineContentType', () => {
  const structural = (score: number, reason: string | null): SignalResult => ({
    layerId: 'content-type',
    ok: true,
    score,
    reason,
    detail: { status: 'scored', values: { structural: true } },
  });
  const model = (score: number, reason: string | null): SignalResult => ({
    layerId: 'content-type',
    ok: true,
    score,
    reason,
    detail: { status: 'scored', values: { winningLabel: 'engagement bait' } },
  });

  test('takes the model result when it is strictly stronger', () => {
    const combined = combineContentType(
      structural(0.3, '2 hashtags'),
      model(0.9, 'engagement bait content'),
    );
    expect(combined.reason).toBe('engagement bait content');
    expect(combined.detail?.values?.winningLabel).toBe('engagement bait');
  });

  test('keeps a confident structural fire over a weaker model result', () => {
    const combined = combineContentType(structural(0.85, '9 hashtags'), model(0.4, null));
    expect(combined.reason).toBe('9 hashtags');
    expect(combined.detail?.values?.structural).toBe(true);
  });

  test('a loaded model never lowers a confident structural score', () => {
    const structuralResult = structural(0.85, '9 hashtags');
    const combined = combineContentType(structuralResult, model(0.8, 'engagement bait content'));
    expect(combined.score).toBe(structuralResult.score);
  });

  test('an unavailable or gated model leaves the structural score untouched', () => {
    const unavailable: SignalResult = {
      layerId: 'content-type',
      ok: false,
      score: 0,
      reason: null,
      detail: { status: 'unavailable' },
    };
    const combined = combineContentType(structural(0.45, 'numbered list'), unavailable);
    expect(combined.reason).toBe('numbered list');
    expect(combined.score).toBe(0.45);
  });

  test('keeps scorePost to a single content-type contribution so the layer weight is not doubled', () => {
    const combined = combineContentType(
      structural(0.45, 'numbered list'),
      model(0.9, 'engagement bait content'),
    );
    const result = scorePost(post, [combined], DEFAULT_SCORING_CONFIG);
    expect(result.contributions).toHaveLength(1);
    expect(result.compositeScore).toBeCloseTo(0.9 * 0.5, 10);
  });
});

describe('callToAction imperative phrases', () => {
  const NEVER_FIRE = [
    'I like this',
    'I like this post a lot',
    'We like this approach',
    'Like I said, it is late.',
    'I will follow up tomorrow',
    'Follow up: the bridge reopened',
    'follow-up meeting at noon',
    'They follow the river north',
    'Share prices fell today',
    'I want to share this with you',
    'Excited to share that we shipped',
    "we'll share with you later",
    'Happy to share with the team',
    'No comment.',
    'Comment period closes Friday',
    'Comment on the draft by Monday',
    'Reply to all is broken',
    'Looks like this:',
    'Something like this thread from 2019',
    'price tag a bit high',
    'Would you like to share?',
    'You should follow me on this one',
    'Please share your feedback',
    'We’ll share with everyone',
    'Don’t follow me',
    'I’d follow along',
    'You’ll like this post',
    'Can’t share with you',
    'Won’t repost this',
    'RT @bbc: the storm has passed',
    'Retweets are not endorsements',
  ];

  const MUST_FIRE = [
    'like this post',
    'Like and RT',
    'follow me',
    'Follow for more',
    'Follow @x',
    'repost if',
    'retweet to',
    'If this made you smile, repost it.',
    'comment below',
    'Comment SECRET',
    'Reply YES',
    'bookmark this',
    'Save this for later',
    'share with a friend',
    'tag someone',
    'Tag 2 friends',
    'smash that like',
    'follow, like, repost and comment your wallet',
  ];

  test.each(NEVER_FIRE)('bare verb does not fire: %s', (text) => {
    const result = scoreContentFormat(text, CONTENT_FORMAT_DEFAULTS);
    expect(result.score).toBe(0);
    expect(result.detail?.values?.callToAction ?? 0).toBe(0);
  });

  test.each(MUST_FIRE)('imperative call to action fires: %s', (text) => {
    const result = scoreContentFormat(text, CONTENT_FORMAT_DEFAULTS);
    expect(result.detail?.values?.callToAction).toBeGreaterThan(0);
  });

  test('counts distinct verbs in a chain', () => {
    const result = scoreContentFormat(
      'follow, like, repost and comment your wallet',
      CONTENT_FORMAT_DEFAULTS,
    );
    expect(result.detail?.values?.callToAction).toBe(4);
    for (const word of ['likes', 'reposts', 'follows', 'comments']) {
      expect(result.reason).toContain(word);
    }
  });
});

describe('viralHook feature', () => {
  test.each([
    'Unpopular opinion: most meetings should be emails.',
    'Read that again.',
    'Only 99% of people get this right.',
    'Most people don’t know this about tax.',
    'Here’s why: the bridge is closed.',
    'Stop doing this if you want to grow.',
    'Nobody is talking about this.',
    'Let that sink in.',
    'This changes everything for small firms.',
  ])('stock hook fires: %s', (text) => {
    const result = scoreContentFormat(text, CONTENT_FORMAT_DEFAULTS);
    expect(result.detail?.values?.viralHook).toBeGreaterThan(0);
    expect(result.reason).toContain('stock hook phrasing');
  });

  test.each([
    'A thread on how the bridge was rebuilt.',
    'Here’s why the bridge closed in March',
    'Stop the car at the red light.',
    'Only 40% of people surveyed agreed.',
    'Most people like the new timetable.',
    'Read the report before Friday.',
  ])('stock hook does not fire: %s', (text) => {
    const result = scoreContentFormat(text, CONTENT_FORMAT_DEFAULTS);
    expect(result.detail?.values?.viralHook ?? 0).toBe(0);
  });
});

const formatValues = (text: string) =>
  scoreContentFormat(text, CONTENT_FORMAT_DEFAULTS).detail?.values ?? {};

describe('emoji bullets use Extended_Pictographic', () => {
  test('ASCII digits no longer count as emoji bullets', () => {
    const values = formatValues('3 eggs\n2 cups flour\n1 pinch salt');

    expect(values.listRun).toBeUndefined();
  });

  test('a real emoji-bulleted list still fires as a list run', () => {
    const result = scoreContentFormat(
      '\u2705 one thing\n\u2705 two thing\n\u2705 three thing',
      CONTENT_FORMAT_DEFAULTS,
    );

    expect(result.detail?.values?.listRun).toBe(3);
    expect(result.reason).toContain('emoji-bulleted list');
  });
});

describe('keywordExchange', () => {
  test.each([
    "Comment SHIP and I'll send you the link.",
    'Comment "GUIDE" and I will send it to you.',
    'DM me the word TEMPLATE and we will send it over.',
    'Reply YES below and I will DM you the checklist.',
  ])('fires on a keyword ask followed by a send promise: %s', (text) => {
    expect(formatValues(text).keywordExchange).toBe(1);
    expect(scoreContentFormat(text, CONTENT_FORMAT_DEFAULTS).reason).toContain(
      'offers to send something for a keyword reply',
    );
  });

  test('counts each keyword ask that carries its own send promise', () => {
    const values = formatValues(
      "Comment SHIP and I'll send the guide. Comment BOOK and we will send the deck.",
    );

    expect(values.keywordExchange).toBe(2);
  });

  test.each([
    'Reply here and I will share the recording.',
    'DM us your order number and we will send a replacement.',
    'Reply STOP and we will stop sending.',
    'Type NPM install and I will share what breaks.',
    'Comment period ends tonight on the zoning plan.',
  ])('hard negative does not fire: %s', (text) => {
    expect(formatValues(text).keywordExchange ?? 0).toBe(0);
  });

  test('a lowercase word after the verb is never a keyword', () => {
    expect(formatValues('Reply here and I will send it.').keywordExchange ?? 0).toBe(0);
  });

  test('ignores a send promise that falls outside the 120 character window', () => {
    const text = `Comment SHIP ${'x'.repeat(130)} and I'll send it.`;

    expect(formatValues(text).keywordExchange ?? 0).toBe(0);
  });

  test('a keyword ask with no send promise does not fire', () => {
    expect(formatValues('Comment SHIP if you want the list.').keywordExchange ?? 0).toBe(0);
  });
});

describe('urgencyWithAsk', () => {
  test.each([
    [
      'limited spots with a keyword ask',
      "Only 10 spots left, comment SHIP and I'll send the link.",
    ],
    ['limited spots with a call to action', 'Only 5 spots left! Like and repost to claim one.'],
    ['free window with an off-site pointer', 'Free for the next 24 hours. Link is in bio.'],
    ['deadline with a keyword ask', 'Ends tonight: reply SHIP and I will DM you the template.'],
    ['first-N with a follow ask', 'First 50 people to comment get it. Follow me for more.'],
  ])('fires on %s', (_label, text) => {
    expect(formatValues(text).urgencyWithAsk).toBe(1);
    expect(scoreContentFormat(text, CONTENT_FORMAT_DEFAULTS).reason).toContain(
      'deadline or limited-quantity wording beside a request',
    );
  });

  test.each([
    'Only 3 spots left in the pottery class.',
    'Comment period ends tonight on the zoning plan.',
    'Last chance to see the exhibit before it closes.',
  ])('urgency alone without a request does not fire: %s', (text) => {
    expect(formatValues(text).urgencyWithAsk ?? 0).toBe(0);
  });

  test('a request alone without urgency does not fire', () => {
    expect(formatValues("Comment SHIP and I'll send the link.").urgencyWithAsk ?? 0).toBe(0);
  });
});

describe('closed viral hook templates', () => {
  test.each([
    ['wrong answers only', 'Wrong answers only: what is the capital of France?'],
    ['without telling me', 'Tell me your password without telling me why.'],
    ["i'll go first", "I'll go first: my worst habit is checking email at 6am."],
  ])('fires on %s', (_label, text) => {
    expect(formatValues(text).viralHook).toBeGreaterThan(0);
  });

  test.each([
    'Only wrong answers were accepted on the quiz.',
    'The bank acted without telling customers about the fee.',
  ])('hard negative does not fire: %s', (text) => {
    expect(formatValues(text).viralHook ?? 0).toBe(0);
  });
});
