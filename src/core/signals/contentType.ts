import type { SignalResult } from '@/core/scoring/types';

// Provisional HD-008 option: the three categories named by the PRD, equal treatment.
export const CONTENT_TYPE_LABELS = Object.freeze([
  'engagement bait',
  'generic motivational content',
  'giveaway or crypto spam',
] as const);

export interface ContentTypePrototypeExample {
  text: string;
  note: string;
}

export interface ContentTypePrototypeSet {
  label: (typeof CONTENT_TYPE_LABELS)[number];
  examples: readonly ContentTypePrototypeExample[];
  note: string;
}

export const CONTENT_TYPE_PROTOTYPES: readonly ContentTypePrototypeSet[] = Object.freeze([
  {
    label: 'engagement bait',
    note: 'Direct requests for interaction, sharing, replies, or follows.',
    examples: Object.freeze([
      { text: 'Like this post if you agree.', note: 'Like request.' },
      { text: 'Repost this to your followers.', note: 'Repost request.' },
      { text: 'Comment YES to claim your spot.', note: 'Comment keyword prompt.' },
      { text: 'Follow for daily updates.', note: 'Follow request.' },
      { text: 'Share this with three friends.', note: 'Share request.' },
      { text: 'Drop a heart if this helped.', note: 'Reaction request.' },
      { text: 'Tag someone who needs to see this.', note: 'Tagging request.' },
      { text: 'Retweet to spread the word.', note: 'Retweet request.' },
      { text: 'Save this post and come back later.', note: 'Save request.' },
      { text: 'Hit like and tell us your favorite.', note: 'Like and reply prompt.' },
      { text: 'Reply with your answer below.', note: 'Reply request.' },
      { text: 'Join the conversation and repost.', note: 'Conversation and repost prompt.' },
    ]),
  },
  {
    label: 'generic motivational content',
    note: 'Broad self-improvement slogans about persistence, discipline, and success.',
    examples: Object.freeze([
      { text: 'Believe in yourself and keep going.', note: 'Self-belief slogan.' },
      { text: 'Success starts with a positive mindset.', note: 'Mindset slogan.' },
      { text: 'Trust the process and never give up.', note: 'Persistence slogan.' },
      {
        text: 'Your future self will thank you for starting today.',
        note: 'Future-self encouragement.',
      },
      { text: 'Small steps every day create big results.', note: 'Consistency slogan.' },
      { text: 'Stay focused on your goals.', note: 'Goal-focus slogan.' },
      { text: 'Discipline will take you where motivation cannot.', note: 'Discipline slogan.' },
      { text: 'Great things take time and persistence.', note: 'Patience slogan.' },
      { text: 'Keep grinding even when nobody is watching.', note: 'Grind slogan.' },
      { text: 'Your only limit is the one you accept.', note: 'Limitations slogan.' },
      { text: 'Turn setbacks into fuel for the next chapter.', note: 'Resilience slogan.' },
      { text: 'Consistency beats intensity over the long run.', note: 'Long-term effort slogan.' },
    ]),
  },
  {
    label: 'giveaway or crypto spam',
    note: 'Prize, token, wallet, deposit, or airdrop promotion language.',
    examples: Object.freeze([
      { text: 'Win a free prize in our giveaway.', note: 'Prize giveaway.' },
      { text: 'The first 100 winners get a bonus.', note: 'Winner bonus.' },
      { text: 'Claim your free tokens today.', note: 'Free-token claim.' },
      { text: 'Bitcoin airdrop ends tonight.', note: 'Bitcoin airdrop.' },
      { text: 'Send crypto to enter this giveaway.', note: 'Crypto transfer promotion.' },
      { text: 'Double your coins with this limited offer.', note: 'Coin doubling promise.' },
      { text: 'Free ETH for every eligible wallet.', note: 'Wallet reward.' },
      { text: 'Winner announcement for our prize drop.', note: 'Prize announcement.' },
      { text: 'Deposit now to unlock your reward.', note: 'Deposit-to-reward prompt.' },
      { text: 'Exclusive airdrop for early participants.', note: 'Early-participant airdrop.' },
      { text: 'Claim this crypto bonus before it expires.', note: 'Crypto bonus urgency.' },
      {
        text: 'Guaranteed giveaway rewards while supplies last.',
        note: 'Guaranteed reward promotion.',
      },
    ]),
  },
]);

export const CENTROID_SIMILARITY_THRESHOLD = 0.62;

export interface ContentCentroidConfig {
  similarityThreshold: number;
}

const reasonByLabel: Readonly<Record<string, string>> = Object.freeze({
  'engagement bait': 'engagement bait content',
  'generic motivational content': 'generic motivational content',
  'giveaway or crypto spam': 'giveaway or crypto-spam content',
});

const cosineSimilarity = (left: ArrayLike<number>, right: ArrayLike<number>): number | null => {
  if (left.length === 0 || left.length !== right.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return dot / Math.sqrt(leftNorm * rightNorm);
};

const noCentroidData = (status: 'no-data' | 'unavailable'): SignalResult => ({
  layerId: 'content-type',
  ok: false,
  score: 0,
  reason: null,
  detail: { status },
});

export const scoreContentCentroid = (
  embedding: ArrayLike<number> | null | undefined,
  centroids: readonly ArrayLike<number>[],
  config: ContentCentroidConfig = { similarityThreshold: CENTROID_SIMILARITY_THRESHOLD },
): SignalResult => {
  if (!embedding || embedding.length === 0) return noCentroidData('no-data');
  if (centroids.length !== CONTENT_TYPE_LABELS.length) return noCentroidData('unavailable');

  const similarities = centroids.map((centroid) => cosineSimilarity(embedding, centroid));
  if (similarities.some((similarity) => similarity === null)) return noCentroidData('unavailable');

  const values: Record<string, number | string | boolean | null> = {
    similarityThreshold: config.similarityThreshold,
  };
  CONTENT_TYPE_LABELS.forEach((label, index) => {
    values[label] = similarities[index] ?? 0;
  });
  let topIndex = 0;
  for (let index = 1; index < similarities.length; index += 1) {
    if (
      (similarities[index] ?? Number.NEGATIVE_INFINITY) >
      (similarities[topIndex] ?? Number.NEGATIVE_INFINITY)
    )
      topIndex = index;
  }
  const winningLabel = CONTENT_TYPE_LABELS[topIndex];
  const winningSimilarity = similarities[topIndex] ?? 0;
  if (!winningLabel) return noCentroidData('unavailable');
  values.winningLabel = winningLabel;

  if (winningSimilarity < config.similarityThreshold) {
    return {
      layerId: 'content-type',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'below-cutoff', values },
    };
  }

  return {
    layerId: 'content-type',
    ok: true,
    score: Math.max(0, Math.min(1, winningSimilarity)),
    reason: reasonByLabel[winningLabel] ?? null,
    detail: { status: 'scored', values },
  };
};

// SF-220: structural engagement-bait features observable in the markup alone, with no model and no
// download. Every feature is individually named, individually weighted (HD-005), and individually
// reported so the SF-213 inspector shows the raw counts. No feature depends on the language being
// English; the call-to-action phrasing is the one keyword-driven feature and its data lives in one
// exported constant rather than inline literals.
export type ContentFormatFeatureId =
  | 'callToAction'
  | 'hashtagStuffing'
  | 'mentionStuffing'
  | 'listRun'
  | 'hookThenList'
  | 'allCapsOpener'
  | 'linkShortener';

export interface ContentFormatConfig {
  hashtagThreshold: number;
  mentionThreshold: number;
  listRunFloor: number;
  hookLineMaxChars: number;
  linkShortenerHosts: readonly string[];
  featureWeights: Readonly<Record<ContentFormatFeatureId, number>>;
  scoreCap: number;
}

// HD-005: the keyword data behind the call-to-action feature. Structural copy only: what the post
// asks the reader to do, never a claim about who wrote it.
const CALL_TO_ACTION_TRIGGERS = Object.freeze([
  'like',
  'repost',
  'retweet',
  'follow',
  'comment',
  'share',
] as const);

const CTA_PLURAL: Readonly<Record<string, string>> = Object.freeze({
  like: 'likes',
  repost: 'reposts',
  retweet: 'retweets',
  follow: 'follows',
  comment: 'comments',
  share: 'shares',
});

const HASHTAG_RE = /#[^\s#]+/g;
const MENTION_RE = /@[^\s@]+/g;
const URL_RE = /https?:\/\/[^\s]+/gi;
const NUMBERED_ITEM_RE = /^\s*\d+[.)]\s+/u;
const BULLET_ITEM_RE =
  /^\s*(?:[\p{Emoji}\u2022\u25AA\u25CF\u2714\u2713\u2726\u271D\u25B8\u25C9\u2705\u2757\u26A0*-])\s+/u;

interface FiredFormatFeature {
  id: ContentFormatFeatureId;
  count: number;
  reason: string;
}

const lines = (text: string): string[] => text.split(/\r?\n/);

const firstNonEmptyLine = (text: string): string | null => {
  for (const line of lines(text)) {
    if (line.trim().length > 0) return line.trim();
  }
  return null;
};

const longestListRun = (text: string): { length: number; kind: 'number' | 'emoji' } => {
  let best = 0;
  let current = 0;
  let kind: 'number' | 'emoji' = 'emoji';
  for (const line of lines(text)) {
    if (NUMBERED_ITEM_RE.test(line)) {
      current += 1;
      kind = 'number';
    } else if (BULLET_ITEM_RE.test(line)) {
      current += 1;
      if (current === 1 || kind !== 'number') kind = 'emoji';
    } else {
      current = 0;
    }
    if (current > best) best = current;
  }
  return { length: best, kind };
};

const isAllCapsLine = (line: string | null): boolean => {
  if (!line || line.length < 3) return false;
  if (!/[A-Za-z]/.test(line)) return false;
  return line === line.toUpperCase() && line !== line.toLowerCase();
};

const detectContentFormat = (text: string, config: ContentFormatConfig): FiredFormatFeature[] => {
  const fired: FiredFormatFeature[] = [];
  const lower = text.toLowerCase();

  const cta = CALL_TO_ACTION_TRIGGERS.filter((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  });
  if (cta.length > 0) {
    fired.push({
      id: 'callToAction',
      count: cta.length,
      reason: `asks for ${cta.map((word) => CTA_PLURAL[word] ?? `${word}s`).join(' and ')}`,
    });
  }

  const hashtags = text.match(HASHTAG_RE) ?? [];
  if (hashtags.length >= config.hashtagThreshold) {
    fired.push({
      id: 'hashtagStuffing',
      count: hashtags.length,
      reason: `${hashtags.length} hashtags`,
    });
  }

  const mentions = text.match(MENTION_RE) ?? [];
  if (mentions.length >= config.mentionThreshold) {
    fired.push({
      id: 'mentionStuffing',
      count: mentions.length,
      reason: `${mentions.length} mentions`,
    });
  }

  const run = longestListRun(text);
  if (run.length >= config.listRunFloor) {
    fired.push({
      id: 'listRun',
      count: run.length,
      reason: run.kind === 'number' ? 'numbered list' : 'emoji-bulleted list',
    });
  }

  const firstLine = firstNonEmptyLine(text);
  if (
    firstLine !== null &&
    firstLine.length <= config.hookLineMaxChars &&
    run.length >= config.listRunFloor
  ) {
    fired.push({ id: 'hookThenList', count: run.length, reason: 'short hook line above a list' });
  }

  if (isAllCapsLine(firstLine)) {
    fired.push({ id: 'allCapsOpener', count: 1, reason: 'ALL-CAPS opener' });
  }

  const hosts = config.linkShortenerHosts;
  const shorteners = (text.match(URL_RE) ?? []).filter((url) => {
    const host =
      url
        .replace(/^https?:\/\//i, '')
        .split(/[/:]/)[0]
        ?.toLowerCase() ?? '';
    return hosts.includes(host);
  }).length;
  if (shorteners > 0) {
    fired.push({
      id: 'linkShortener',
      count: shorteners,
      reason: shorteners === 1 ? '1 shortened link' : `${shorteners} shortened links`,
    });
  }

  return fired;
};

// SF-220: grade structural bait features. Fail open on unusual input: empty text (media-only posts)
// and quote-posts that carry no own text return no-data rather than a fire. The score is the sum of
// the fired feature weights clamped at the documented cap, which keeps any single feature below the
// hide threshold while letting a confident structural fire stand on its own.
export const scoreContentFormat = (text: string, config: ContentFormatConfig): SignalResult => {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return {
      layerId: 'content-type',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'no-data' },
    };
  }

  const fired = detectContentFormat(text, config);
  const values: Record<string, number | string | boolean | null> = {
    firedFeatureCount: fired.length,
  };
  for (const feature of fired) values[feature.id] = feature.count;

  if (fired.length === 0) {
    return {
      layerId: 'content-type',
      ok: true,
      score: 0,
      reason: null,
      detail: { status: 'below-cutoff', values },
    };
  }

  const total = fired.reduce((sum, feature) => sum + (config.featureWeights[feature.id] ?? 0), 0);
  const score = Math.min(config.scoreCap, total);
  const reason = fired.map((feature) => feature.reason).join(' · ');
  return {
    layerId: 'content-type',
    ok: true,
    score,
    reason,
    detail: { status: 'scored', values },
  };
};

// SF-220/SF-222: the layer becomes structural-plus-model, taking the stronger of the two so a loaded
// centroid model never dilutes a confident structural fire. When the model is unavailable it
// scores 0, so the structural signal wins by default.
export const combineContentType = (structural: SignalResult, model: SignalResult): SignalResult =>
  model.score > structural.score ? model : structural;
