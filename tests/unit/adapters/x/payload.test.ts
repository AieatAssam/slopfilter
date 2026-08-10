import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  extractPayload,
  isOperationUrl,
  isPayloadRelayMessage,
  type PayloadContract,
  payloadContract,
  payloadRelayFromExtract,
  validatePayloadContract,
} from '@/adapters/x/payload';

const readFixture = (): unknown =>
  JSON.parse(readFileSync('tests/fixtures/payload/x/home-timeline.json', 'utf8'));

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
});

describe('fallback chains', () => {
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
