export const RETENTION_WEEKS = 12;
export const MIN_RATE_DENOMINATOR = 10;
export const STATS_DB_NAME = 'slopfilter-stats';
const DB_VERSION = 1;
const STORE_NAME = 'weekly';

export interface WeeklyStats {
  week: string;
  seen: number;
  hidden: number;
  byReason: Record<string, number>;
  wrongCalls: number;
}

export interface LoadedWeeklyStats extends WeeklyStats {
  wrongCallRate: number | null;
}

const weekStart = (date: Date): Date => {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - day + 1);
  return result;
};

const currentWeek = (): string => weekStart(new Date()).toISOString().slice(0, 10);

const emptyStats = (week: string): WeeklyStats => ({
  week,
  seen: 0,
  hidden: 0,
  byReason: {},
  wrongCalls: 0,
});

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(STATS_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'week' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('failed to open stats database'));
  });

const withStore = <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore, finish: (value: T) => void) => void,
): Promise<T> =>
  openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        let result: T;
        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error('stats transaction failed'));
        };
        try {
          callback(store, (value) => {
            result = value;
          });
        } catch (error) {
          database.close();
          reject(error);
        }
      }),
  );

const prune = (store: IDBObjectStore, keepFrom: string) => {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const key = String(cursor.key);
    if (key < keepFrom) cursor.delete();
    cursor.continue();
  };
};

const pruneCurrentRetention = (store: IDBObjectStore) => {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_WEEKS * 7);
  prune(store, weekStart(cutoff).toISOString().slice(0, 10));
};

export const recordBatch = (
  entries: readonly { hidden: boolean; reasons: readonly string[] }[],
): Promise<void> =>
  withStore('readwrite', (store, finish) => {
    const week = currentWeek();
    const request = store.get(week);
    request.onsuccess = () => {
      const stats = (request.result as WeeklyStats | undefined) ?? emptyStats(week);
      stats.seen += entries.length;
      stats.hidden += entries.filter((entry) => entry.hidden).length;
      for (const reason of entries.flatMap((entry) => (entry.hidden ? entry.reasons : []))) {
        stats.byReason[reason] = (stats.byReason[reason] ?? 0) + 1;
      }
      store.put(stats);
      pruneCurrentRetention(store);
      finish(undefined);
    };
  });

export const recordWrongCall = (reasonIds: readonly string[]): Promise<void> =>
  withStore('readwrite', (store, finish) => {
    const week = currentWeek();
    const request = store.get(week);
    request.onsuccess = () => {
      const stats = (request.result as WeeklyStats | undefined) ?? emptyStats(week);
      stats.wrongCalls += 1;
      for (const reason of reasonIds) stats.byReason[reason] = stats.byReason[reason] ?? 0;
      store.put(stats);
      pruneCurrentRetention(store);
      finish(undefined);
    };
  });

export const loadWeeklyStats = (): Promise<LoadedWeeklyStats> =>
  withStore('readonly', (store, finish) => {
    const week = currentWeek();
    const request = store.get(week);
    request.onsuccess = () => {
      const stats = (request.result as WeeklyStats | undefined) ?? emptyStats(week);
      finish({
        ...stats,
        wrongCallRate:
          stats.hidden >= MIN_RATE_DENOMINATOR ? stats.wrongCalls / stats.hidden : null,
      });
    };
  });

export const clearAllStats = (): Promise<void> =>
  withStore('readwrite', (store, finish) => {
    store.clear();
    finish(undefined);
  });
