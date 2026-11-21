// Cross-session author observation cache. SF-215: the behavioural rate needs sightings
// accumulated across timeline loads, because two posts by the same author in one For You pass
// are rare. Post ids and timestamps only; post text is never persisted.

export const AUTHOR_CAP = 200;
export const PER_AUTHOR_POST_CAP = 200;
export const DB_NAME = 'slopfilter-author-activity';
export const DB_VERSION = 1;

const AUTHORS_STORE = 'authors';
const LAST_SEEN_INDEX = 'lastSeen';

export interface AuthorActivityRecord {
  handle: string;
  firstSeen: number;
  lastSeen: number;
  posts: Record<string, number>;
  profileJoinDate: number | null;
  profilePostCount: number | null;
  // SF-216: when an intercepted X payload supplied the profile, keep the observation time.
  profileObservedAt: number | null;
  // HD-005: follower and following counts from the intercepted payload. Missing on records written
  // before this field existed; readers treat undefined as null, so no DB_VERSION bump is needed.
  profileFollowers?: number | null;
  profileFollowing?: number | null;
}

type TransactionSetup<T> = (transaction: IDBTransaction, setResult: (result: T) => void) => void;

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(AUTHORS_STORE)
        ? request.transaction?.objectStore(AUTHORS_STORE)
        : database.createObjectStore(AUTHORS_STORE, { keyPath: 'handle' });
      if (store && !store.indexNames.contains(LAST_SEEN_INDEX)) {
        store.createIndex(LAST_SEEN_INDEX, 'lastSeen', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('failed to open activity database'));
  });

const transact = <T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  setup: TransactionSetup<T>,
): Promise<T> =>
  openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        let settled = false;
        let result: T;
        let transaction: IDBTransaction;
        try {
          transaction = database.transaction(storeNames, mode);
          transaction.oncomplete = () => {
            if (settled) return;
            settled = true;
            database.close();
            resolve(result);
          };
          transaction.onerror = () => {
            if (settled) return;
            settled = true;
            database.close();
            reject(transaction.error ?? new Error('author activity transaction failed'));
          };
          transaction.onabort = () => {
            if (settled) return;
            settled = true;
            database.close();
            reject(transaction.error ?? new Error('author activity transaction aborted'));
          };
          setup(transaction, (value) => {
            result = value;
          });
        } catch (error) {
          if (!settled) {
            settled = true;
            database.close();
            reject(error);
          }
        }
      }),
  );

const validTimestamp = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

const createRecord = (
  handle: string,
  posts: Readonly<Record<string, number>>,
  profileJoinDate: number | null,
  profilePostCount: number | null,
  profileObservedAt: number | null = null,
  profileFollowers: number | null = null,
  profileFollowing: number | null = null,
): AuthorActivityRecord => {
  const timestamps = Object.values(posts);
  return {
    handle,
    firstSeen: timestamps.length === 0 ? 0 : Math.min(...timestamps),
    lastSeen: timestamps.length === 0 ? 0 : Math.max(...timestamps),
    posts: posts as Record<string, number>,
    profileJoinDate,
    profilePostCount,
    profileObservedAt,
    profileFollowers,
    profileFollowing,
  };
};

const pruneAuthorCap = (
  store: IDBObjectStore,
  setResult: (result: AuthorActivityRecord) => void,
  record: AuthorActivityRecord,
) => {
  const countRequest = store.count();
  countRequest.onsuccess = () => {
    let remaining = countRequest.result - AUTHOR_CAP;
    if (remaining <= 0) {
      setResult(record);
      return;
    }
    const cursorRequest = store.index(LAST_SEEN_INDEX).openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || remaining <= 0) {
        setResult(record);
        return;
      }
      cursor.delete();
      remaining -= 1;
      if (remaining > 0) cursor.continue();
    };
  };
};

const prunePostCap = (posts: ReadonlyMap<string, number>): Record<string, number> => {
  if (posts.size <= PER_AUTHOR_POST_CAP) return Object.fromEntries(posts);
  const entries = Array.from(posts.entries()).sort((left, right) => left[1] - right[1]);
  return Object.fromEntries(entries.slice(entries.length - PER_AUTHOR_POST_CAP));
};

export const recordSightings = (
  handle: string,
  sightings: readonly { postId: string; timestamp: number }[],
  profile?: { joinDate?: number | null; postCount?: number | null },
): Promise<AuthorActivityRecord | null> => {
  const key = handle.trim();
  if (!key) throw new Error('account handle is required');
  return transact<AuthorActivityRecord | null>(
    [AUTHORS_STORE],
    'readwrite',
    (transaction, setResult) => {
      const store = transaction.objectStore(AUTHORS_STORE);
      const getRequest = store.get(key);
      getRequest.onsuccess = () => {
        const existing = (getRequest.result as AuthorActivityRecord | null) ?? null;
        const seen = new Map<string, number>();
        if (existing) {
          for (const [postId, timestamp] of Object.entries(existing.posts))
            seen.set(postId, timestamp);
        }
        for (const sighting of sightings) {
          const timestamp = validTimestamp(sighting.timestamp);
          if (!timestamp) continue;
          const current = seen.get(sighting.postId);
          if (current === undefined || timestamp > current) seen.set(sighting.postId, timestamp);
        }
        const posts = prunePostCap(seen);
        if (Object.keys(posts).length === 0) {
          setResult(null);
          return;
        }
        const joined = profile?.joinDate ?? existing?.profileJoinDate ?? null;
        const postCount = profile?.postCount ?? existing?.profilePostCount ?? null;
        const record = createRecord(
          key,
          posts,
          joined,
          postCount,
          existing?.profileObservedAt ?? null,
          existing?.profileFollowers ?? null,
          existing?.profileFollowing ?? null,
        );
        const putRequest = store.put(record);
        putRequest.onsuccess = () => pruneAuthorCap(store, setResult, record);
      };
    },
  );
};

export const getActivity = (handle: string): Promise<AuthorActivityRecord | null> => {
  const key = handle.trim();
  if (!key) return Promise.resolve(null);
  return transact<AuthorActivityRecord | null>(
    [AUTHORS_STORE],
    'readonly',
    (transaction, setResult) => {
      const request = transaction.objectStore(AUTHORS_STORE).get(key);
      request.onsuccess = () => setResult((request.result as AuthorActivityRecord | null) ?? null);
    },
  );
};

// SF-216: write derived author stats from an intercepted X payload. Only the numbers named
// in the payload contract are persisted; the raw response and post text never touch storage.
export const updateAuthorProfile = (
  handle: string,
  profile: {
    joinDate: number | null;
    postCount: number | null;
    followers?: number | null;
    following?: number | null;
  },
  observedAt: number,
): Promise<AuthorActivityRecord | null> => {
  const key = handle.trim();
  if (!key) throw new Error('account handle is required');
  return transact<AuthorActivityRecord | null>(
    [AUTHORS_STORE],
    'readwrite',
    (transaction, setResult) => {
      const store = transaction.objectStore(AUTHORS_STORE);
      const getRequest = store.get(key);
      getRequest.onsuccess = () => {
        const existing = (getRequest.result as AuthorActivityRecord | null) ?? null;
        const joinDate = profile.joinDate ?? existing?.profileJoinDate ?? null;
        const postCount = profile.postCount ?? existing?.profilePostCount ?? null;
        const followers = profile.followers ?? existing?.profileFollowers ?? null;
        const following = profile.following ?? existing?.profileFollowing ?? null;
        const record = createRecord(
          key,
          existing?.posts ?? {},
          joinDate,
          postCount,
          existing?.profileObservedAt ?? observedAt,
          followers,
          following,
        );
        const putRequest = store.put(record);
        putRequest.onsuccess = () => pruneAuthorCap(store, setResult, record);
      };
    },
  );
};

export const clearAllActivity = (): Promise<void> =>
  transact([AUTHORS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(AUTHORS_STORE).clear();
  });
