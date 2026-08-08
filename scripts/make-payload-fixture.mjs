// Generates tests/fixtures/payload/x/home-timeline.json: a synthetic HomeTimeline response.
//
// Shape mirrors the live response captured over CDP on 2026-08-08 and recorded in
// plan/tickets/SF-216.yaml under verified_payload. X has restructured the old flat user
// `legacy` object into typed sub-objects: post count is `tweet_counts.tweets`, account
// creation is `core.created_at`, and `statuses_count` no longer exists anywhere.
//
// All handles, names, ids, text, and counts are synthetic. Nothing here is captured content.
//
// Ages are computed against FIXTURE_NOW, not the wall clock, so every derived rate is stable
// forever. Signals consuming account age MUST take `now` as an argument and tests MUST pass
// FIXTURE_NOW; a signal calling Date.now() directly will drift and eventually fail.
//
// Regenerate: node scripts/make-payload-fixture.mjs

import fs from 'node:fs';
import path from 'node:path';

export const FIXTURE_NOW = Date.parse('2026-08-08T12:00:00.000Z');
const DAY = 86_400_000;

const xDate = (ms) => {
  const d = new Date(ms);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const p = (n) => String(n).padStart(2, '0');
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}`;
};

let idSeq = 1_900_000_000_000_000_000n;
const nextId = () => {
  idSeq += 1_337n;
  return String(idSeq);
};

/**
 * @param {object} c case definition
 * c.ageDays        account age in days at FIXTURE_NOW (null omits core.created_at)
 * c.tweets         lifetime post count (null omits tweet_counts entirely)
 * c.postedMinsAgo  post age in minutes
 * c.badCreatedAt   emit an unparseable creation date
 */
const makeTweet = (c) => {
  const userId = String(700_000_000 + c.n);
  const core = { name: c.name, screen_name: c.handle };
  if (c.badCreatedAt) core.created_at = 'not a date';
  else if (c.ageDays !== null) core.created_at = xDate(FIXTURE_NOW - c.ageDays * DAY);

  const user = {
    __typename: 'User',
    id: `VXNlcjo${userId}`,
    rest_id: userId,
    core,
    avatar: { image_url: `https://pbs.twimg.com/profile_images/${userId}/avatar_normal.jpg` },
    dm_permissions: { can_dm: false },
    location: { location: c.location ?? '' },
    media_permissions: { can_media_tag: true },
    is_blue_verified: Boolean(c.blueVerified),
    profile_bio: { description: c.bio ?? '', entities: {} },
    privacy: { protected: false },
    relationship_counts: { followers: c.followers, following: c.following ?? 300 },
    relationship_perspectives: {
      blocked_by: false,
      blocking: false,
      followed_by: false,
      following: false,
      live_following: false,
      muting: false,
    },
    verification: { verified: Boolean(c.verified) },
    profile_image_shape: 'Circle',
  };
  if (c.tweets !== null)
    user.tweet_counts = { tweets: c.tweets, media_tweets: Math.floor(c.tweets * 0.2) };

  const postedAt = FIXTURE_NOW - (c.postedMinsAgo ?? 60) * 60_000;
  const tweetId = nextId();
  const legacy = {
    bookmark_count: c.bookmarks ?? 0,
    conversation_id_str: tweetId,
    created_at: xDate(postedAt),
    favorite_count: c.likes,
    full_text: c.text,
    is_quote_status: Boolean(c.quoted),
    lang: 'en',
    quote_count: c.quotes ?? 0,
    reply_count: c.replies,
    retweet_count: c.reposts,
    user_id_str: userId,
    id_str: tweetId,
    entities: { hashtags: [], symbols: [], urls: [], user_mentions: [] },
  };
  if (c.images?.length) {
    legacy.entities.media = c.images.map((key, i) => ({
      display_url: `pic.x.com/${key}`,
      expanded_url: `https://x.com/${c.handle}/status/${tweetId}/photo/${i + 1}`,
      id_str: `${tweetId}${i}`,
      media_url_https: `https://pbs.twimg.com/media/${key}?format=jpg&name=small`,
      type: 'photo',
      sizes: { small: { h: 383, w: 680, resize: 'fit' } },
      original_info: { height: 1080, width: 1920 },
    }));
    legacy.extended_entities = { media: legacy.entities.media };
  }
  if (c.video) {
    const m = {
      display_url: 'pic.x.com/vid1',
      id_str: `${tweetId}v`,
      media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/thumb.jpg',
      type: 'video',
      video_info: {
        aspect_ratio: [16, 9],
        duration_millis: 30_000,
        variants: [
          {
            bitrate: 832_000,
            content_type: 'video/mp4',
            url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/640x360/synthetic.mp4',
          },
        ],
      },
    };
    legacy.entities.media = [m];
    legacy.extended_entities = { media: [m] };
  }

  const result = {
    __typename: 'Tweet',
    rest_id: tweetId,
    core: { user_results: { result: user } },
    legacy,
    views: c.views === null ? {} : { count: String(c.views), state: 'EnabledWithCount' },
    source: '<a href="https://mobile.x.com" rel="nofollow">X for Android</a>',
    unmention_data: {},
    edit_control: {
      edit_tweet_ids: [tweetId],
      editable_until_msecs: String(postedAt + 3_600_000),
      is_edit_eligible: true,
      edits_remaining: '5',
    },
    is_translatable: false,
  };
  if (c.noteTweet) {
    result.note_tweet = {
      is_expandable: true,
      note_tweet_results: {
        result: {
          id: `Tm90ZVR3ZWV0OjE${c.n}`,
          text: c.noteTweet,
          entity_set: { hashtags: [], symbols: [], urls: [], user_mentions: [] },
        },
      },
    };
  }
  if (c.quoted) {
    result.quoted_status_result = { result: makeTweet({ ...c.quoted, n: c.n + 500 }) };
    legacy.quoted_status_id_str = result.quoted_status_result.result.rest_id;
  }
  return result;
};

// Each case names the signal path it exists to exercise. Keep that mapping when adding rows.
const cases = [
  // --- SF-217 cohort: young account, industrial volume. 545d / 41000 posts = 75.2/day.
  {
    n: 1,
    handle: 'account01',
    name: 'Daily Growth Notes',
    ageDays: 545,
    tweets: 41_000,
    followers: 18_400,
    text: 'Reply YES and I will send you the 12 habits that changed my life. Repost so more people see this.',
    likes: 31,
    reposts: 4,
    replies: 96,
    views: 412_000,
    postedMinsAgo: 12,
  },

  // --- SF-217 cohort + content-type giveaway/crypto. 99d / 9800 posts = 99/day, with media.
  {
    n: 2,
    handle: 'account02',
    name: 'Airdrop Signals',
    ageDays: 99,
    tweets: 9_800,
    followers: 2_310,
    blueVerified: true,
    text: 'GIVEAWAY: 5000 USDT to one winner. Follow, like, repost and comment your wallet. Crypto airdrop closes tonight.',
    likes: 8,
    reposts: 2,
    replies: 411,
    views: 96_400,
    postedMinsAgo: 25,
    images: ['SYNTHmedia001.jpg'],
  },

  // --- content-type generic motivational, moderate cohort pressure. 946d / 30000 = 31.7/day.
  {
    n: 3,
    handle: 'account03',
    name: 'Mindset Daily',
    ageDays: 946,
    tweets: 30_000,
    followers: 88_900,
    text: 'Success is not luck. It is mindset, discipline and the grind nobody sees. Motivation is a choice you make daily.',
    likes: 240,
    reposts: 33,
    replies: 12,
    views: 61_000,
    postedMinsAgo: 40,
  },

  // --- negative for SF-217: old account, high volume, legitimate. 6200d / 310000 = 50/day.
  {
    n: 4,
    handle: 'account04',
    name: 'Regional Transit Alerts',
    ageDays: 6_200,
    tweets: 310_000,
    followers: 412_000,
    verified: true,
    text: 'Northbound line 3 is running 15 minutes behind following an earlier signal fault at Central. Next update at 14:30.',
    likes: 190,
    reposts: 76,
    replies: 21,
    views: 88_000,
    postedMinsAgo: 8,
  },

  // --- mirrors a real observed author: 2638d / 36193 = 13.7/day. Should not fire anywhere.
  {
    n: 5,
    handle: 'account05',
    name: 'Kite Photography',
    ageDays: 2_638,
    tweets: 36_193,
    followers: 136_291,
    text: 'Spent the morning at the estuary waiting for the tide. Three frames worth keeping out of four hundred.',
    likes: 107,
    reposts: 6,
    replies: 9,
    views: 5_822,
    postedMinsAgo: 95,
    images: ['SYNTHmedia002.jpg', 'SYNTHmedia003.jpg'],
  },

  // --- engagement-ratio signal: enormous reach, negligible interaction.
  {
    n: 6,
    handle: 'account06',
    name: 'Trend Recycler',
    ageDays: 380,
    tweets: 22_400,
    followers: 940,
    text: 'This changes everything for anyone building in public this year.',
    likes: 12,
    reposts: 1,
    replies: 0,
    views: 2_140_000,
    postedMinsAgo: 33,
  },

  // --- negative: genuinely popular, strong absolute engagement.
  {
    n: 7,
    handle: 'account07',
    name: 'Marine Biology Lab',
    ageDays: 3_400,
    tweets: 4_100,
    followers: 512_000,
    verified: true,
    text: 'Our team recorded the same individual whale on three separate surveys nine years apart. Full write-up in the thread below.',
    likes: 25_958,
    reposts: 4_120,
    replies: 380,
    views: 3_594_208,
    postedMinsAgo: 180,
  },

  // --- SF-217 guard: below minimum account age. 5d / 300 posts computes to 60/day on noise.
  {
    n: 8,
    handle: 'account08',
    name: 'Brand New Here',
    ageDays: 5,
    tweets: 300,
    followers: 12,
    text: 'Testing the water. First week on here and already enjoying it.',
    likes: 2,
    reposts: 0,
    replies: 1,
    views: 340,
    postedMinsAgo: 55,
  },

  // --- SF-217 guard: below minimum post count. 400d / 80 posts.
  {
    n: 9,
    handle: 'account09',
    name: 'Occasional Poster',
    ageDays: 400,
    tweets: 80,
    followers: 640,
    text: 'Finally finished rewiring the workshop. Took four weekends longer than planned.',
    likes: 44,
    reposts: 2,
    replies: 6,
    views: 3_100,
    postedMinsAgo: 240,
  },

  // --- no-data: user object carries no tweet_counts at all.
  {
    n: 10,
    handle: 'account10',
    name: 'Counts Missing',
    ageDays: 700,
    tweets: null,
    followers: 3_400,
    text: 'A perfectly ordinary post from an account whose post count is absent from the payload.',
    likes: 18,
    reposts: 1,
    replies: 2,
    views: 2_400,
    postedMinsAgo: 70,
  },

  // --- no-data: no account creation date.
  {
    n: 11,
    handle: 'account11',
    name: 'Undated Account',
    ageDays: null,
    tweets: 5_000,
    followers: 900,
    text: 'An account whose creation date is missing from the payload entirely.',
    likes: 7,
    reposts: 0,
    replies: 0,
    views: 810,
    postedMinsAgo: 110,
  },

  // --- no-data: creation date present but unparseable.
  {
    n: 12,
    handle: 'account12',
    name: 'Malformed Date',
    ageDays: 900,
    badCreatedAt: true,
    tweets: 26_000,
    followers: 1_500,
    text: 'An account whose creation date is present but not a date this parser understands.',
    likes: 3,
    reposts: 0,
    replies: 1,
    views: 700,
    postedMinsAgo: 130,
  },

  // --- views absent: engagement ratio must fail open rather than divide by nothing.
  {
    n: 13,
    handle: 'account13',
    name: 'No View Count',
    ageDays: 1_200,
    tweets: 9_100,
    followers: 2_200,
    text: 'A post whose view count is missing, which the ratio signal must treat as unknown.',
    likes: 15,
    reposts: 2,
    replies: 3,
    views: null,
    postedMinsAgo: 150,
  },

  // --- long form: note_tweet overflow, exercises text length handling and the classifier budget.
  {
    n: 14,
    handle: 'account14',
    name: 'Long Form Notes',
    ageDays: 1_800,
    tweets: 12_000,
    followers: 44_000,
    text: 'A thread on why estuary tides matter for migratory birds, and what four hundred mornings of observation actually show.',
    noteTweet: `A thread on why estuary tides matter for migratory birds. ${'The birds arrive on the falling tide and feed along the exposed mud for roughly two hours. '.repeat(14)}`,
    likes: 900,
    reposts: 120,
    replies: 40,
    views: 120_000,
    postedMinsAgo: 300,
  },

  // --- quote post: nested tweet_results, exercises adapter recursion and author attribution.
  {
    n: 15,
    handle: 'account15',
    name: 'Quote Commentator',
    ageDays: 2_000,
    tweets: 18_000,
    followers: 7_700,
    text: 'This matches what the survey data showed last year.',
    likes: 60,
    reposts: 8,
    replies: 4,
    views: 14_000,
    postedMinsAgo: 44,
    quoted: {
      handle: 'account07',
      name: 'Marine Biology Lab',
      ageDays: 3_400,
      tweets: 4_100,
      followers: 512_000,
      verified: true,
      text: 'Our team recorded the same individual whale on three separate surveys nine years apart.',
      likes: 25_958,
      reposts: 4_120,
      replies: 380,
      views: 3_594_208,
      postedMinsAgo: 180,
    },
  },

  // --- video post: layer 4 must skip video and score only image thumbnails.
  {
    n: 16,
    handle: 'account16',
    name: 'Clip Reposter',
    ageDays: 260,
    tweets: 15_800,
    followers: 5_100,
    text: 'Watch until the end. Repost if this made you smile.',
    likes: 410,
    reposts: 88,
    replies: 15,
    views: 610_000,
    postedMinsAgo: 20,
    video: true,
  },

  // --- media-only: no text at all, so the classifier must be skipped rather than fed an empty string.
  {
    n: 17,
    handle: 'account17',
    name: 'Silent Media',
    ageDays: 1_500,
    tweets: 6_400,
    followers: 3_300,
    text: '',
    likes: 22,
    reposts: 3,
    replies: 1,
    views: 4_900,
    postedMinsAgo: 210,
    images: ['SYNTHmedia004.jpg'],
  },

  // --- benign text that must not trip the content-type lexical gate.
  {
    n: 18,
    handle: 'account18',
    name: 'Allotment Diary',
    ageDays: 2_900,
    tweets: 3_200,
    followers: 1_100,
    text: 'The second sowing of radishes came up unevenly, probably because the bed dried out while I was away.',
    likes: 31,
    reposts: 1,
    replies: 5,
    views: 2_000,
    postedMinsAgo: 260,
  },
];

const entries = cases.map((c, i) => ({
  entryId: `tweet-${1_900_000_000_000_000_000n + BigInt(i)}`,
  sortIndex: String(1_800_000_000_000_000_000n - BigInt(i)),
  content: {
    entryType: 'TimelineTimelineItem',
    __typename: 'TimelineTimelineItem',
    itemContent: {
      itemType: 'TimelineTweet',
      __typename: 'TimelineTweet',
      tweet_results: { result: makeTweet(c) },
      tweetDisplayType: 'Tweet',
    },
    clientEventInfo: { component: 'suggest_ranked_organic_tweet', element: 'tweet' },
  },
}));

// --- promoted entry: adapter must mark it isAd. Promoted posts carry no sortIndex neighbours.
const adCase = {
  n: 19,
  handle: 'account19',
  name: 'Sponsored Offer',
  ageDays: 1_000,
  tweets: 4_400,
  followers: 60_000,
  text: 'Limited offer on our annual plan. Learn more.',
  likes: 5,
  reposts: 0,
  replies: 0,
  views: 900_000,
  postedMinsAgo: 5,
};
const adResult = makeTweet(adCase);
entries.splice(3, 0, {
  entryId: `promoted-tweet-${adResult.rest_id}`,
  sortIndex: '1799999999999999000',
  content: {
    entryType: 'TimelineTimelineItem',
    __typename: 'TimelineTimelineItem',
    itemContent: {
      itemType: 'TimelineTweet',
      __typename: 'TimelineTweet',
      tweet_results: { result: adResult },
      tweetDisplayType: 'Tweet',
      promotedMetadata: {
        advertiser_results: { result: adResult.core.user_results.result },
        disclosureType: 'NoDisclosure',
        experimentValues: [],
        impressionId: 'synthetic-impression-1',
        clickTrackingInfo: { urlParams: [] },
      },
    },
    clientEventInfo: { component: 'suggest_promoted', element: 'tweet' },
  },
});

entries.push(
  {
    entryId: 'cursor-top-1800000000000000000',
    sortIndex: '1800000000000000001',
    content: {
      entryType: 'TimelineTimelineCursor',
      __typename: 'TimelineTimelineCursor',
      value: 'DAABCgABSYNTHETIC-TOP',
      cursorType: 'Top',
    },
  },
  {
    entryId: 'cursor-bottom-1800000000000000000',
    sortIndex: '1799999999999999000',
    content: {
      entryType: 'TimelineTimelineCursor',
      __typename: 'TimelineTimelineCursor',
      value: 'DAABCgABSYNTHETIC-BOTTOM',
      cursorType: 'Bottom',
    },
  },
);

const payload = {
  data: {
    home: {
      home_timeline_urt: {
        instructions: [{ type: 'TimelineClearCache' }, { type: 'TimelineAddEntries', entries }],
        metadata: { scribeConfig: { page: 'profile' } },
        responseObjects: { feedbackActions: [], immediateReactions: [] },
      },
    },
  },
};

const out = path.join(process.cwd(), 'tests/fixtures/payload/x/home-timeline.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote ${out}`);
console.log(`entries ${entries.length} (${cases.length} organic, 1 promoted, 2 cursors)`);
