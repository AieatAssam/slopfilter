import { CONTENT_FORMAT_DEFAULTS } from '@/core/scoring/weights';
import type { ContentFormatFeatureId } from '@/core/signals/contentType';

// SF-220 calibration rows for scoreContentFormat. Each row names the outcome it must reach: a
// strong fire (sum of weights at or above 0.6), a moderate fire, no fire, or no-data on the fail-open
// guards. Derivation is written for each row so the outcome is auditable, not a tuned literal.

export type ContentFormatOutcome = 'strong' | 'moderate' | 'no-fire' | 'no-data';

export interface ContentFormatRow {
  id: string;
  outcome: ContentFormatOutcome;
  text: string;
  firedFeatures: readonly ContentFormatFeatureId[];
  derivation: string;
}

export const CONTENT_FORMAT_ROWS: readonly ContentFormatRow[] = [
  {
    id: 'like-repost-giveaway-with-hashtags',
    outcome: 'strong',
    firedFeatures: ['callToAction', 'hashtagStuffing', 'listRun', 'hookThenList'],
    text: `LIKE and REPOST to enter
1. ✅ Follow @mega_giveaway
2. ✅ Repost this post
3. ✅ Comment your wallet address
#giveaway #crypto #airdrop #bitcoin #free #win #prize #moon`,
    derivation:
      'callToAction 0.35 (asks for likes and reposts and follows and comments) + hashtagStuffing 0.30 (8 hashtags) ' +
      '+ listRun 0.20 (3-item numbered list) + hookThenList 0.25 (short first line above a list) = 1.10, clamped to cap 0.85.',
  },
  {
    id: 'numbered-emoji-list-under-hook',
    outcome: 'moderate',
    firedFeatures: ['listRun', 'hookThenList'],
    text: `3 tips for a bigger audience
1. 🚀 Post every day
2. 🚀 Publish a thread
3. 🚀 Add a poll`,
    derivation:
      'hookThenList 0.25 (33-char hook line above a list) + listRun 0.20 (3-item numbered list) = 0.45, a moderate fire. ' +
      'No call-to-action phrasing and no hashtag count over the threshold.',
  },
  {
    id: 'normal-post-two-hashtags',
    outcome: 'no-fire',
    firedFeatures: [],
    text: 'Just back from a long hike in the hills. #weekend #nature',
    derivation:
      '2 hashtags is below the 6 threshold; no call-to-action, list, hook, all-caps opener, or shortened link. ' +
      'No feature fires, so the score is 0 with no reason.',
  },
  {
    id: 'media-only-post',
    outcome: 'no-data',
    firedFeatures: [],
    text: '',
    derivation:
      'Empty text (a media-only or textless quote post) fails open to no-data rather than guessing at structure.',
  },
  {
    id: 'non-latin-script-bait',
    outcome: 'strong',
    firedFeatures: ['hashtagStuffing', 'listRun', 'hookThenList'],
    text: `🔥 प्रिय मित्रों, इस पोस्ट को पढ़ें
1. 💯 लाइक करें और शेयर करें
2. 💯 फॉलो करें
3. 💯 टैग करें अपने दोस्तों को
#उपहार #क्रिप्टो #मुफ्त #इनाम #जीत #मार्केटिंग #मीम`,
    derivation:
      'No English call-to-action keyword matches, but hashtagStuffing 0.30 (7 hashtags), listRun 0.20 (3-item numbered ' +
      'list), and hookThenList 0.25 fire on language-neutral structure alone = 0.75. The row proves the feature set ' +
      'does not depend on English.',
  },
  {
    id: 'single-feature-below-hide-threshold',
    outcome: 'moderate',
    firedFeatures: ['hashtagStuffing'],
    text: 'Here is the full lineup for tonight: #draft #nba #highlights #news #scores #updates #recap #more',
    derivation:
      'Only hashtagStuffing fires (8 hashtags) at 0.30. 0.30 * content-type weight 0.5 = 0.15 composite, well below the ' +
      '0.6 hide threshold: a single feature never hides a post on its own.',
  },
];

export const CONTENT_FORMAT_REFERENCE = CONTENT_FORMAT_DEFAULTS;
