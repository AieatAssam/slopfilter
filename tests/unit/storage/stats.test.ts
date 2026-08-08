import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  clearAllStats,
  loadWeeklyStats,
  MIN_RATE_DENOMINATOR,
  RETENTION_WEEKS,
  recordBatch,
  recordWrongCall,
  STATS_DB_NAME,
} from '@/storage/stats';

const resetDatabase = async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(STATS_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database reset blocked'));
  });
};

describe('stats', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.useRealTimers();
  });

  test('records one batch of ten posts with the correct totals', async () => {
    await recordBatch(
      Array.from({ length: 10 }, (_, index) => ({
        hidden: index < 4,
        reasons: index < 4 ? ['frequency'] : [],
      })),
    );

    const stats = await loadWeeklyStats();
    expect(stats.seen).toBe(10);
    expect(stats.hidden).toBe(4);
    expect(stats.byReason.frequency).toBe(4);
  });

  test('prunes buckets older than the retention window on write', async () => {
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    await recordBatch([{ hidden: false, reasons: [] }]);
    vi.setSystemTime(new Date('2026-12-01T12:00:00.000Z'));
    await recordBatch([{ hidden: false, reasons: [] }]);

    expect((await loadWeeklyStats()).seen).toBe(1);
    expect(RETENTION_WEEKS).toBeGreaterThan(0);
  });

  test('also prunes old buckets when recording a wrong call', async () => {
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    await recordBatch([{ hidden: false, reasons: [] }]);
    vi.setSystemTime(new Date('2026-12-01T12:00:00.000Z'));
    await recordWrongCall([]);

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(STATS_DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const buckets = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction('weekly', 'readonly').objectStore('weekly').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    expect(buckets).toHaveLength(1);
  });

  test('suppresses the wrong-call rate below the minimum denominator', async () => {
    await recordBatch([{ hidden: true, reasons: ['reason'] }]);
    await recordWrongCall(['reason']);
    expect((await loadWeeklyStats()).wrongCallRate).toBeNull();

    await recordBatch(
      Array.from({ length: MIN_RATE_DENOMINATOR - 1 }, () => ({
        hidden: true,
        reasons: ['reason'],
      })),
    );
    expect((await loadWeeklyStats()).wrongCallRate).not.toBeNull();
  });

  test('clearAllStats empties every bucket', async () => {
    await recordBatch([{ hidden: true, reasons: ['reason'] }]);
    await clearAllStats();

    expect((await loadWeeklyStats()).seen).toBe(0);
    expect((await loadWeeklyStats()).hidden).toBe(0);
  });

  test('hidden-by-reason counts sum to the hidden count', async () => {
    await recordBatch([
      { hidden: true, reasons: ['frequency', 'engagement'] },
      { hidden: true, reasons: ['frequency'] },
      { hidden: false, reasons: [] },
    ]);

    const stats = await loadWeeklyStats();
    expect(stats.hidden).toBe(2);
    expect(
      Object.values(stats.byReason).reduce((sum, count) => sum + count, 0),
    ).toBeGreaterThanOrEqual(stats.hidden);
  });
});
