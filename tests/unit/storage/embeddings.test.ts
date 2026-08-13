import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import type { RepetitionCorpusEntry } from '@/core/signals/repetition';
import {
  addCorpusEntry,
  addEmbedding,
  clearAll,
  countEmbeddings,
  DB_NAME,
  type EmbeddingRecord,
  listCorpusEntries,
  listEmbeddingIds,
  listEmbeddings,
  loadCentroids,
  saveCentroids,
} from '@/storage/embeddings';

const record = (index: number): EmbeddingRecord => ({
  postId: `post-${index}`,
  vector: new Float32Array([index, index + 1]),
  createdAt: index,
});

const corpusEntry = (index: number): RepetitionCorpusEntry => ({
  postId: `corpus-${index}`,
  handle: `@handle-${index}`,
  embedding: new Float32Array([index, index + 1]),
  simhash: BigInt(index),
  observedAt: index,
});

const resetDatabase = async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database reset blocked'));
  });
};

describe('embedding store', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test('caps the store at 1000 entries', async () => {
    for (let index = 0; index < 1005; index += 1) await addEmbedding(record(index));

    expect(await countEmbeddings()).toBe(1000);
  });

  test('evicts oldest first', async () => {
    for (let index = 0; index < 1005; index += 1) await addEmbedding(record(index));

    const ids = await listEmbeddingIds();
    expect(ids).not.toEqual(
      expect.arrayContaining(['post-0', 'post-1', 'post-2', 'post-3', 'post-4']),
    );
    expect(ids).toEqual(expect.arrayContaining(['post-5', 'post-1004']));
    expect(ids).toHaveLength(1000);
  });

  test('never persists post text', async () => {
    await addEmbedding({ ...record(1), postId: 'private-post' });

    const [stored] = await listEmbeddings();
    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty('text');
    expect(stored).not.toHaveProperty('postText');
  });

  test('persists and reloads centroids', async () => {
    const centroids = [new Float32Array([0.1, 0.2]), new Float32Array([0.8, 0.9])];

    await saveCentroids(centroids);

    expect(await loadCentroids()).toEqual(centroids);
  });

  test('rejects rather than silently swallowing a write failure', async () => {
    const invalid = { ...record(1), postId: {} as string };

    await expect(addEmbedding(invalid)).rejects.toHaveProperty('name', 'DataError');
  });

  test('clears embeddings and centroids', async () => {
    await addEmbedding(record(1));
    await saveCentroids([new Float32Array([1])]);

    await clearAll();

    expect(await countEmbeddings()).toBe(0);
    expect(await loadCentroids()).toBeNull();
  });
});

describe('repetition corpus store', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test('caps the corpus at the documented cap and evicts oldest first', async () => {
    for (let index = 0; index < 505; index += 1) await addCorpusEntry(corpusEntry(index), 500);

    const entries = await listCorpusEntries();

    expect(entries).toHaveLength(500);
    expect(entries.map((entry) => entry.postId)).not.toEqual(
      expect.arrayContaining(['corpus-0', 'corpus-1', 'corpus-2', 'corpus-3', 'corpus-4']),
    );
    expect(entries.map((entry) => entry.postId)).toEqual(
      expect.arrayContaining(['corpus-5', 'corpus-504']),
    );
  });

  test('round-trips vectors and hashes without ever persisting post text', async () => {
    await addCorpusEntry(corpusEntry(1), 500);

    const [stored] = await listCorpusEntries();

    expect(stored).toBeDefined();
    expect(stored?.postId).toBe('corpus-1');
    expect(stored?.handle).toBe('@handle-1');
    expect(stored?.simhash).toBe(BigInt(1));
    expect(stored?.embedding).toEqual(new Float32Array([1, 2]));
    expect(stored).not.toHaveProperty('text');
    expect(stored).not.toHaveProperty('postText');
  });

  test('clears the corpus alongside the downvote embeddings and centroids', async () => {
    await addEmbedding(record(1));
    await saveCentroids([new Float32Array([1])]);
    await addCorpusEntry(corpusEntry(1), 500);

    await clearAll();

    expect(await countEmbeddings()).toBe(0);
    expect(await loadCentroids()).toBeNull();
    expect(await listCorpusEntries()).toEqual([]);
  });
});
