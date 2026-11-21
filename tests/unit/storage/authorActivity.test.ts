import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  AUTHOR_CAP,
  clearAllActivity,
  DB_NAME,
  getActivity,
  PER_AUTHOR_POST_CAP,
  recordSightings,
  updateAuthorProfile,
} from '@/storage/authorActivity';

const resetDatabase = async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('database reset blocked'));
  });
};

describe('author activity store', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test('deduplicates sightings by distinct post id, keeping the newest timestamp', async () => {
    const record = await recordSightings('@account01', [
      { postId: 'post-1', timestamp: 1000 },
      { postId: 'post-1', timestamp: 900 },
      { postId: 'post-2', timestamp: 800 },
    ]);

    expect(Object.keys(record?.posts ?? {})).toEqual(['post-1', 'post-2']);
    expect(record?.posts['post-1']).toBe(1000);
    expect(record?.firstSeen).toBe(800);
    expect(record?.lastSeen).toBe(1000);
  });

  test('merges new sightings into an existing record without duplication', async () => {
    await recordSightings('@account01', [{ postId: 'post-1', timestamp: 1000 }]);
    const record = await recordSightings('@account01', [
      { postId: 'post-2', timestamp: 1200 },
      { postId: 'post-1', timestamp: 900 },
    ]);

    expect(Object.keys(record?.posts ?? {})).toHaveLength(2);
    expect(record?.lastSeen).toBe(1200);
  });

  test('enforces the author cap by evicting the oldest last-seen inside the write transaction', async () => {
    const overflow = AUTHOR_CAP + 10;
    const handles = Array.from({ length: overflow }, (_, index) => `@author-${index}`);
    let index = 0;
    for (const handle of handles) {
      await recordSightings(handle, [{ postId: 'post', timestamp: index }]);
      index += 1;
    }

    const survivors = await Promise.all(
      handles.slice(overflow - AUTHOR_CAP).map((handle) => getActivity(handle)),
    );
    const oldest = await getActivity('@author-0');

    expect(survivors.every((activity) => activity !== null)).toBe(true);
    expect(oldest).toBeNull();
  });

  test('caps the per-author retained post ids by the newest timestamps', async () => {
    const overflow = PER_AUTHOR_POST_CAP + 20;
    const sightings = Array.from({ length: overflow }, (_, index) => ({
      postId: `post-${index}`,
      timestamp: index,
    }));
    const record = await recordSightings('@account01', sightings);

    expect(Object.keys(record?.posts ?? {})).toHaveLength(PER_AUTHOR_POST_CAP);
    expect(record?.firstSeen).toBe(20);
    expect(record?.posts['post-20']).toBe(20);
    expect(record?.posts[`post-${overflow - 1}`]).toBe(overflow - 1);
  });

  test('stores optional profile stats and keeps them across merges', async () => {
    await recordSightings('@account01', [{ postId: 'post-1', timestamp: 1000 }], {
      joinDate: 500,
      postCount: 40,
    });
    const record = await recordSightings('@account01', [{ postId: 'post-2', timestamp: 1200 }]);

    expect(record?.profileJoinDate).toBe(500);
    expect(record?.profilePostCount).toBe(40);
  });

  test('preserves cached profile stats when a later profile is partial', async () => {
    await recordSightings('@account01', [{ postId: 'post-1', timestamp: 1000 }], {
      joinDate: 500,
      postCount: 40,
    });
    const record = await recordSightings('@account01', [{ postId: 'post-2', timestamp: 1200 }], {
      joinDate: null,
      postCount: null,
    });

    expect(record?.profileJoinDate).toBe(500);
    expect(record?.profilePostCount).toBe(40);
  });

  test('rejects an empty handle', () => {
    expect(() => recordSightings('   ', [{ postId: 'post-1', timestamp: 1000 }])).toThrow(
      'account handle is required',
    );
  });

  test('clears all stored activity', async () => {
    await recordSightings('@account01', [{ postId: 'post-1', timestamp: 1000 }]);

    await clearAllActivity();

    expect(await getActivity('@account01')).toBeNull();
  });

  test('returns null for an unknown author', async () => {
    expect(await getActivity('@nobody')).toBeNull();
  });

  test('stores follower and following counts from the payload profile', async () => {
    await updateAuthorProfile(
      '@account01',
      { joinDate: 500, postCount: 40, followers: 50, following: 6000 },
      1000,
    );
    const record = await getActivity('@account01');

    expect(record?.profileFollowers).toBe(50);
    expect(record?.profileFollowing).toBe(6000);
  });

  test('keeps stored follower counts when a later write omits them', async () => {
    await updateAuthorProfile(
      '@account01',
      { joinDate: 500, postCount: 40, followers: 50, following: 6000 },
      1000,
    );
    await recordSightings('@account01', [{ postId: 'post-1', timestamp: 1200 }]);
    await updateAuthorProfile('@account01', { joinDate: null, postCount: null }, 1300);
    const record = await getActivity('@account01');

    expect(record?.profileFollowers).toBe(50);
    expect(record?.profileFollowing).toBe(6000);
  });

  test('defaults follower counts to null when the payload did not carry them', async () => {
    const record = await recordSightings('@account01', [{ postId: 'post-1', timestamp: 1000 }]);

    expect(record?.profileFollowers ?? null).toBeNull();
    expect(record?.profileFollowing ?? null).toBeNull();
  });
});
