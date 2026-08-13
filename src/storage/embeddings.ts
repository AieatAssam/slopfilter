import type { RepetitionCorpusEntry } from '@/core/signals/repetition';

export const EMBEDDING_CAP = 1000;
export const DB_NAME = 'slopfilter-embeddings';
export const DB_VERSION = 2;

const EMBEDDINGS_STORE = 'embeddings';
const CENTROIDS_STORE = 'centroids';
const CREATED_AT_INDEX = 'createdAt';
const CENTROIDS_KEY = 'current';
// SF-219: the recent-post corpus is a separate store from the downvote embeddings so one policy
// never spills into the other. Entries hold vectors and hashes, never post text.
const CORPUS_STORE = 'repetition-corpus';
const CORPUS_CREATED_AT_INDEX = 'createdAt';

export interface EmbeddingRecord {
  postId: string;
  vector: Float32Array;
  createdAt: number;
}

type TransactionSetup<T> = (transaction: IDBTransaction, setResult: (result: T) => void) => void;

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const embeddings = database.objectStoreNames.contains(EMBEDDINGS_STORE)
        ? request.transaction?.objectStore(EMBEDDINGS_STORE)
        : database.createObjectStore(EMBEDDINGS_STORE, { keyPath: 'postId' });
      if (embeddings && !embeddings.indexNames.contains(CREATED_AT_INDEX)) {
        embeddings.createIndex(CREATED_AT_INDEX, 'createdAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(CENTROIDS_STORE))
        database.createObjectStore(CENTROIDS_STORE);
      if (!database.objectStoreNames.contains(CORPUS_STORE)) {
        const corpus = database.createObjectStore(CORPUS_STORE, { keyPath: 'postId' });
        corpus.createIndex(CORPUS_CREATED_AT_INDEX, 'observedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('failed to open embedding database'));
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
            reject(transaction.error ?? new Error('embedding transaction failed'));
          };
          transaction.onabort = () => {
            if (settled) return;
            settled = true;
            database.close();
            reject(transaction.error ?? new Error('embedding transaction aborted'));
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

export const addEmbedding = (record: EmbeddingRecord): Promise<void> =>
  transact([EMBEDDINGS_STORE], 'readwrite', (transaction) => {
    const store = transaction.objectStore(EMBEDDINGS_STORE);
    store.put({ postId: record.postId, vector: record.vector, createdAt: record.createdAt });
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      let remaining = countRequest.result - EMBEDDING_CAP;
      if (remaining <= 0) return;

      const cursorRequest = store.index(CREATED_AT_INDEX).openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || remaining <= 0) return;
        cursor.delete();
        remaining -= 1;
        if (remaining > 0) cursor.continue();
      };
    };
  });

export const countEmbeddings = (): Promise<number> =>
  transact([EMBEDDINGS_STORE], 'readonly', (transaction, setResult) => {
    const request = transaction.objectStore(EMBEDDINGS_STORE).count();
    request.onsuccess = () => setResult(request.result);
  });

export const listEmbeddingIds = (): Promise<string[]> =>
  transact([EMBEDDINGS_STORE], 'readonly', (transaction, setResult) => {
    const request = transaction.objectStore(EMBEDDINGS_STORE).index(CREATED_AT_INDEX).getAll();
    request.onsuccess = () => setResult(request.result.map((record) => record.postId));
  });

export const listEmbeddings = (): Promise<EmbeddingRecord[]> =>
  transact([EMBEDDINGS_STORE], 'readonly', (transaction, setResult) => {
    const request = transaction.objectStore(EMBEDDINGS_STORE).index(CREATED_AT_INDEX).getAll();
    request.onsuccess = () =>
      setResult(
        request.result.map((record) => ({
          postId: record.postId,
          vector: new Float32Array(record.vector),
          createdAt: record.createdAt,
        })),
      );
  });

export const saveCentroids = (centroids: readonly Float32Array[]): Promise<void> =>
  transact([CENTROIDS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(CENTROIDS_STORE).put(centroids, CENTROIDS_KEY);
  });

export const loadCentroids = (): Promise<Float32Array[] | null> =>
  transact([CENTROIDS_STORE], 'readonly', (transaction, setResult) => {
    const request = transaction.objectStore(CENTROIDS_STORE).get(CENTROIDS_KEY);
    request.onsuccess = () => {
      const centroids = request.result as Float32Array[] | undefined;
      setResult(centroids ? centroids.map((centroid) => new Float32Array(centroid)) : null);
    };
  });

export const addCorpusEntry = (record: RepetitionCorpusEntry, cap: number): Promise<void> =>
  transact([CORPUS_STORE], 'readwrite', (transaction) => {
    const store = transaction.objectStore(CORPUS_STORE);
    store.put({
      postId: record.postId,
      handle: record.handle,
      embedding: record.embedding,
      simhash: record.simhash,
      observedAt: record.observedAt,
    });
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      let remaining = countRequest.result - cap;
      if (remaining <= 0) return;
      const cursorRequest = store.index(CORPUS_CREATED_AT_INDEX).openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || remaining <= 0) return;
        cursor.delete();
        remaining -= 1;
        if (remaining > 0) cursor.continue();
      };
    };
  });

export const listCorpusEntries = (): Promise<RepetitionCorpusEntry[]> =>
  transact([CORPUS_STORE], 'readonly', (transaction, setResult) => {
    const request = transaction.objectStore(CORPUS_STORE).index(CORPUS_CREATED_AT_INDEX).getAll();
    request.onsuccess = () =>
      setResult(
        request.result.map((record) => ({
          postId: record.postId,
          handle: record.handle,
          embedding: new Float32Array(record.embedding),
          simhash: BigInt(record.simhash),
          observedAt: record.observedAt,
        })),
      );
  });

export const clearAll = (): Promise<void> =>
  transact([EMBEDDINGS_STORE, CENTROIDS_STORE, CORPUS_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(EMBEDDINGS_STORE).clear();
    transaction.objectStore(CENTROIDS_STORE).clear();
    transaction.objectStore(CORPUS_STORE).clear();
  });
