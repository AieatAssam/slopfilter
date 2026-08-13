import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  extractPayload,
  isOperationUrl,
  isPayloadRelayMessage,
  operationForUrl,
  type PayloadContract,
  payloadContract,
  payloadRelayFromExtract,
  resolveEntry,
  validatePayloadContract,
} from '@/adapters/x/payload';

const readFixture = (): unknown =>
  JSON.parse(readFileSync('tests/fixtures/payload/x/home-timeline.json', 'utf8'));

const standaloneTweetFixture = (): unknown => ({
  data: {
    tweetResult: {
      result: {
        rest_id: '2087272392557007042',
        core: {
          user_results: {
            result: {
              core: {
                created_at: 'Sun Apr 27 20:19:25 +0000 2008',
                screen_name: 'dhh',
              },
              tweet_counts: { tweets: 70921 },
            },
          },
        },
        legacy: {
          favorite_count: 4765,
          reply_count: 208,
          retweet_count: 85,
          id_str: '2087272392557007042',
          created_at: 'Tue Aug 11 20:18:12 +0000 2026',
        },
      },
    },
  },
});

const threadTweetFixture = (): unknown => {
  const result = (
    standaloneTweetFixture() as {
      data: { tweetResult: { result: Record<string, unknown> } };
    }
  ).data.tweetResult.result;
  return {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [
          {
            entries: [
              {
                content: { itemContent: { tweet_results: { result } } },
              },
            ],
          },
        ],
      },
    },
  };
};

describe('extractPayload', () => {
  test('walks the fixture and returns per-author stats and per-post engagement', () => {
    const extract = extractPayload(readFixture());

    expect(extract.authors.length).toBe(19);
    const account01 = extract.authors.find((author) => author.handle === '@account01');
    expect(account01?.accountCreatedAt).toBe(Date.parse('Sun Feb 09 12:00:00 +0000 2025'));
    expect(account01?.totalPosts).toBe(41000);
    expect(account01?.mediaPosts).toBe(8200);

    const first = extract.engagement['1900000000000001337'];
    expect(first?.likes).toBe(31);
    expect(first?.reposts).toBe(4);
    expect(first?.replies).toBe(96);
    expect(first?.views).toBe(412000);
  });

  test('yields no-data rather than a throw for an author with a missing tweet_counts', () => {
    const extract = extractPayload(readFixture());

    const account10 = extract.authors.find((author) => author.handle === '@account10');
    expect(account10?.totalPosts).toBeNull();
    expect(account10?.accountCreatedAt).toBe(Date.parse('Sat Sep 07 12:00:00 +0000 2024'));
  });

  test('keeps an invalid created_at as null instead of failing', () => {
    const extract = extractPayload(readFixture());

    expect(
      extract.authors.find((author) => author.handle === '@account11')?.accountCreatedAt,
    ).toBeNull();
    expect(
      extract.authors.find((author) => author.handle === '@account12')?.accountCreatedAt,
    ).toBeNull();
  });

  test('parses a numeric-string view count', () => {
    const extract = extractPayload(readFixture());
    expect(extract.engagement['1900000000000001337']?.views).toBe(412000);
  });

  test('extracts author metadata from a standalone tweet response', () => {
    const extract = extractPayload(standaloneTweetFixture());
    const dhh = extract.authors.find((author) => author.handle === '@dhh');

    expect(dhh?.accountCreatedAt).toBe(Date.parse('Sun Apr 27 20:19:25 +0000 2008'));
    expect(dhh?.totalPosts).toBe(70921);
    expect(extract.engagement['2087272392557007042']?.likes).toBe(4765);
  });

  test('extracts the same fields from a TweetDetail thread envelope', () => {
    const extract = extractPayload(threadTweetFixture());
    expect(extract.authors[0]?.handle).toBe('@dhh');
    expect(extract.authors[0]?.totalPosts).toBe(70921);
  });
});

describe('fallback chains', () => {
  test('a null primary value does not block a populated fallback', () => {
    expect(
      resolveEntry(
        { primary: null, fallback: 42 },
        {
          id: 'fallback-test',
          description: 'test fallback',
          context: 'document',
          paths: ['primary', 'fallback'],
          required: true,
        },
      ),
    ).toEqual([42]);
  });

  test('a renamed required user-post-count path resolves via contract fallback', () => {
    const fixture = readFixture() as Record<string, unknown>;
    const renamed = structuredClone(payloadContract);
    renamed.entries = renamed.entries.map((entry) =>
      entry.id === 'user-post-count'
        ? { ...entry, paths: ['renamed.path', ...entry.paths] }
        : entry,
    );
    const extract = extractPayload(fixture, renamed);

    expect(extract.authors.find((author) => author.handle === '@account01')?.totalPosts).toBe(
      41000,
    );
  });

  test('a renamed required path yielding no-data leaves filtering running', () => {
    const fixture = readFixture() as Record<string, unknown>;
    const renamed = structuredClone(payloadContract);
    renamed.entries = renamed.entries.map((entry) =>
      entry.id === 'user-post-count' ? { ...entry, paths: ['does_not_exist.tweets'] } : entry,
    );
    const extract = extractPayload(fixture, renamed);

    expect(extract.authors.find((author) => author.handle === '@account01')?.totalPosts).toBeNull();
    expect(extract.authors.length).toBeGreaterThan(0);
  });
});

describe('isOperationUrl', () => {
  test('matches by the trailing operation name, not the rotating query id', () => {
    expect(
      isOperationUrl(
        'https://x.com/i/api/graphql/psvmu2kIj08INJBBiZVgMw/HomeTimeline',
        'HomeTimeline',
      ),
    ).toBe(true);
    expect(
      isOperationUrl(
        'https://x.com/i/api/graphql/rotates-per-deploy/HomeTimeline?variables=x',
        'HomeTimeline',
      ),
    ).toBe(true);
  });

  test('rejects a different operation', () => {
    expect(isOperationUrl('https://x.com/i/api/graphql/abc/HomeLatest', 'HomeTimeline')).toBe(
      false,
    );
  });

  test('rejects a non-URL match attempt without throwing', () => {
    expect(isOperationUrl('not a url', 'HomeTimeline')).toBe(false);
  });

  test('matches the additional already-fetched detail operations', () => {
    expect(operationForUrl('https://x.com/i/api/graphql/query/TweetResultByRestId')).toBe(
      'TweetResultByRestId',
    );
    expect(operationForUrl('https://x.com/i/api/graphql/query/TweetDetail')).toBe('TweetDetail');
  });
});

describe('relay message', () => {
  test('round-trips a relay message through the type guard', () => {
    const extract = extractPayload(readFixture());
    const message = payloadRelayFromExtract(payloadContract.operation, extract);

    expect(isPayloadRelayMessage(message)).toBe(true);
  });

  test('rejects a relay message with a wrong source', () => {
    const extract = extractPayload(readFixture());
    const message = {
      ...payloadRelayFromExtract(payloadContract.operation, extract),
      source: 'other',
    };

    expect(isPayloadRelayMessage(message)).toBe(false);
  });
});

describe('payloadContract', () => {
  test('validates against the schema used by the drift monitor', () => {
    expect(validatePayloadContract(payloadContract).ok).toBe(true);
  });

  test('a contract missing required fields fails validation', () => {
    const broken = {
      contractVersion: '1.0.0',
      entries: [{ id: 'x', context: 'document', paths: [], required: true }],
    } as unknown as PayloadContract;

    expect(validatePayloadContract(broken).ok).toBe(false);
  });
});
