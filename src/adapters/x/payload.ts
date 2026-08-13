import importedPayloadContract from './payloadContract.json';

export interface PayloadEntry {
  id: string;
  description: string;
  context: 'document' | 'entry' | 'tweet' | 'user';
  paths: readonly string[];
  required: boolean;
}

export interface PayloadContract {
  contractVersion: string;
  operation: string;
  operations?: readonly string[];
  entries: readonly PayloadEntry[];
}

export const payloadContract: PayloadContract = importedPayloadContract as PayloadContract;

export interface ContractValidation {
  ok: boolean;
  errors: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function validatePayloadContract(value: unknown): ContractValidation {
  const errors: string[] = [];

  if (
    !isRecord(value) ||
    typeof value.contractVersion !== 'string' ||
    value.contractVersion.length === 0
  ) {
    errors.push('contractVersion must be a non-empty string');
  }
  if (!isRecord(value) || typeof value.operation !== 'string' || value.operation.length === 0) {
    errors.push('operation must be a non-empty string');
  }
  if (
    isRecord(value) &&
    value.operations !== undefined &&
    (!Array.isArray(value.operations) ||
      value.operations.length === 0 ||
      !value.operations.every((operation) => typeof operation === 'string' && operation.length > 0))
  ) {
    errors.push('operations must be a non-empty array of strings when present');
  }

  if (!isRecord(value) || !Array.isArray(value.entries) || value.entries.length === 0) {
    errors.push('entries must be a non-empty array');
    return { ok: false, errors };
  }

  value.entries.forEach((entry, index) => {
    const id =
      isRecord(entry) && typeof entry.id === 'string' && entry.id.length > 0
        ? entry.id
        : `entry-${index}`;
    if (!isRecord(entry)) {
      errors.push(`${id} must be an object`);
      return;
    }
    if (typeof entry.id !== 'string' || entry.id.length === 0)
      errors.push(`${id} must have a non-empty id`);
    if (typeof entry.description !== 'string' || entry.description.length === 0) {
      errors.push(`${id} must have a non-empty description`);
    }
    if (typeof entry.required !== 'boolean') errors.push(`${id} must have a boolean required flag`);
    if (typeof entry.context !== 'string' || entry.context.length === 0)
      errors.push(`${id} must have a non-empty context`);
    if (
      !Array.isArray(entry.paths) ||
      entry.paths.length === 0 ||
      !entry.paths.every((path) => typeof path === 'string' && path.length > 0)
    ) {
      errors.push(`${id} must have at least one non-empty path`);
    }
  });

  return { ok: errors.length === 0, errors };
}

export function getPayloadEntry(id: string): PayloadEntry {
  const entry = payloadContract.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`payload entry not found: ${id}`);
  return entry;
}

const SEGMENT_RE = /^([^[]+)(\[])?$/;

// Walk a dotted JSON path. A trailing "[]" iterates the preceding key's array, so
// "instructions[].entries[]" yields every timeline entry. Missing keys yield nothing;
// callers must fail open.
const resolvePath = (root: unknown, path: string): unknown[] => {
  const segments = path.split('.');
  let values: unknown[] = [root];
  for (const raw of segments) {
    const match = SEGMENT_RE.exec(raw);
    if (!match?.[1]) return [];
    const key = match[1];
    const iterate = match[2] === '[]';
    const next: unknown[] = [];
    for (const value of values) {
      if (!isRecord(value)) continue;
      const child = value[key];
      if (!iterate) {
        if (child !== undefined) next.push(child);
        continue;
      }
      if (Array.isArray(child)) next.push(...child);
    }
    values = next;
    if (values.length === 0) return [];
  }
  return values;
};

export const resolveEntry = (context: unknown, entry: PayloadEntry): unknown[] => {
  for (const path of entry.paths) {
    const hits = resolvePath(context, path).filter((value) => value !== null);
    if (hits.length > 0) return hits;
  }
  return [];
};

export function isOperationUrl(url: string, operation: string): boolean {
  if (!operation || url.length === 0) return false;
  try {
    const { pathname } = new URL(url);
    return pathname.endsWith(`/${operation}`);
  } catch {
    return false;
  }
}

export const payloadOperations = payloadContract.operations ?? [payloadContract.operation];

export const operationForUrl = (
  url: string,
  operations: readonly string[] = payloadOperations,
): string | null => operations.find((operation) => isOperationUrl(url, operation)) ?? null;

const finiteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

const parseTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export interface PayloadAuthorStats {
  handle: string;
  accountCreatedAt: number | null;
  totalPosts: number | null;
  mediaPosts: number | null;
  followers: number | null;
  following: number | null;
  verified: boolean | null;
}

export interface PayloadTweetEngagement {
  postId: string | null;
  replies: number | null;
  reposts: number | null;
  likes: number | null;
  quotes: number | null;
  bookmarks: number | null;
  views: number | null;
}

export interface PayloadExtract {
  authors: readonly PayloadAuthorStats[];
  engagement: Readonly<Record<string, PayloadTweetEngagement>>;
}

const pick = (values: readonly unknown[]): unknown => values[0];

export function extractPayload(
  json: unknown,
  contract: PayloadContract = payloadContract,
): PayloadExtract {
  if (!isRecord(json)) return { authors: [], engagement: {} };

  const entry = (id: string): PayloadEntry | undefined =>
    contract.entries.find((candidate) => candidate.id === id);
  const entriesEntry = entry('entries') ?? contract.entries[0] ?? payloadContract.entries[0];
  const entries = entriesEntry ? resolveEntry(json, entriesEntry) : [];

  const authors: PayloadAuthorStats[] = [];
  const engagement: Record<string, PayloadTweetEngagement> = {};
  const seenHandles = new Set<string>();
  const tweetEntry = entry('tweet');
  const tweetIdEntry = entry('tweet-id');
  const userEntry = entry('user');

  for (const entryValue of entries) {
    if (!tweetEntry || !tweetIdEntry) continue;
    const nestedTweets = resolveEntry(entryValue, tweetEntry);
    const tweets =
      nestedTweets.length > 0
        ? nestedTweets
        : resolveEntry(entryValue, tweetIdEntry).length > 0
          ? [entryValue]
          : [];
    for (const tweet of tweets) {
      if (!isRecord(tweet)) continue;

      const postId =
        typeof pick(resolveEntry(tweet, tweetIdEntry)) === 'string'
          ? (pick(resolveEntry(tweet, tweetIdEntry)) as string)
          : null;

      const users = userEntry ? resolveEntry(tweet, userEntry) : [];
      for (const user of users) {
        if (!isRecord(user)) continue;
        const handleEntry = entry('user-screen-name');
        const rawHandle =
          handleEntry && typeof pick(resolveEntry(user, handleEntry)) === 'string'
            ? (pick(resolveEntry(user, handleEntry)) as string)
            : null;
        if (!rawHandle) continue;
        const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;

        if (!seenHandles.has(handle)) {
          seenHandles.add(handle);
          authors.push({
            handle,
            accountCreatedAt: parseTimestamp(
              pick(
                resolveEntry(user, entry('user-created-at') ?? getPayloadEntry('user-created-at')),
              ),
            ),
            totalPosts: finiteNumber(
              pick(
                resolveEntry(user, entry('user-post-count') ?? getPayloadEntry('user-post-count')),
              ),
            ),
            mediaPosts: finiteNumber(
              pick(
                resolveEntry(
                  user,
                  entry('user-media-post-count') ?? getPayloadEntry('user-media-post-count'),
                ),
              ),
            ),
            followers: finiteNumber(
              pick(
                resolveEntry(user, entry('user-followers') ?? getPayloadEntry('user-followers')),
              ),
            ),
            following: finiteNumber(
              pick(
                resolveEntry(user, entry('user-following') ?? getPayloadEntry('user-following')),
              ),
            ),
            verified: (() => {
              const raw = pick(
                resolveEntry(user, entry('user-verified') ?? getPayloadEntry('user-verified')),
              );
              return typeof raw === 'boolean' ? raw : null;
            })(),
          });
        }
      }

      if (postId && !(postId in engagement)) {
        const likes = finiteNumber(
          pick(
            resolveEntry(
              tweet,
              entry('tweet-engagement-likes') ?? getPayloadEntry('tweet-engagement-likes'),
            ),
          ),
        );
        const reposts = finiteNumber(
          pick(
            resolveEntry(
              tweet,
              entry('tweet-engagement-reposts') ?? getPayloadEntry('tweet-engagement-reposts'),
            ),
          ),
        );
        const replies = finiteNumber(
          pick(
            resolveEntry(
              tweet,
              entry('tweet-engagement-replies') ?? getPayloadEntry('tweet-engagement-replies'),
            ),
          ),
        );
        const quotes = finiteNumber(
          pick(
            resolveEntry(
              tweet,
              entry('tweet-engagement-quotes') ?? getPayloadEntry('tweet-engagement-quotes'),
            ),
          ),
        );
        const bookmarks = finiteNumber(
          pick(
            resolveEntry(
              tweet,
              entry('tweet-engagement-bookmarks') ?? getPayloadEntry('tweet-engagement-bookmarks'),
            ),
          ),
        );
        const views = finiteNumber(
          pick(resolveEntry(tweet, entry('tweet-views') ?? getPayloadEntry('tweet-views'))),
        );
        engagement[postId] = { postId, replies, reposts, likes, quotes, bookmarks, views };
      }
    }
  }

  return { authors, engagement };
}

export const PAYLOAD_RELAY_SOURCE = 'slopfilter-payload';

export interface PayloadRelayMessage {
  source: typeof PAYLOAD_RELAY_SOURCE;
  operation: string;
  authors: readonly PayloadAuthorStats[];
  engagement: readonly PayloadTweetEngagement[];
}

const nullableNumber = (value: unknown): boolean => value === null || typeof value === 'number';

const isPayloadAuthorStats = (value: unknown): value is PayloadAuthorStats => {
  if (!isRecord(value)) return false;
  return (
    typeof value.handle === 'string' &&
    nullableNumber(value.accountCreatedAt) &&
    nullableNumber(value.totalPosts) &&
    nullableNumber(value.mediaPosts) &&
    nullableNumber(value.followers) &&
    nullableNumber(value.following) &&
    (value.verified === null || typeof value.verified === 'boolean')
  );
};

const isPayloadTweetEngagement = (value: unknown): value is PayloadTweetEngagement => {
  if (!isRecord(value)) return false;
  return (
    typeof value.postId === 'string' &&
    nullableNumber(value.replies) &&
    nullableNumber(value.reposts) &&
    nullableNumber(value.likes) &&
    nullableNumber(value.quotes) &&
    nullableNumber(value.bookmarks) &&
    nullableNumber(value.views)
  );
};

export function isPayloadRelayMessage(value: unknown): value is PayloadRelayMessage {
  return (
    isRecord(value) &&
    value.source === PAYLOAD_RELAY_SOURCE &&
    typeof value.operation === 'string' &&
    Array.isArray(value.authors) &&
    value.authors.every(isPayloadAuthorStats) &&
    Array.isArray(value.engagement) &&
    value.engagement.every(isPayloadTweetEngagement)
  );
}

export function payloadRelayFromExtract(
  operation: string,
  extract: PayloadExtract,
): PayloadRelayMessage {
  return {
    source: PAYLOAD_RELAY_SOURCE,
    operation,
    authors: [...extract.authors],
    engagement: Object.values(extract.engagement),
  };
}
