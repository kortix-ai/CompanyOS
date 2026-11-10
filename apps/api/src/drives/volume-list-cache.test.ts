import { describe, expect, test, mock, beforeEach } from 'bun:test';

// The storage the drive talks to is a stubbed platinumFetch: the cache under
// test lives in volumes.ts's call/list path, so the fake counts calls and
// answers a fixed listing.
let storageCalls = 0;
let failNext = false;
let storageEntries: Array<{ path: string; type: 'file' | 'dir'; size: number; mtime: number }> = [];
mock.module('../shared/platinum', () => ({
  isPlatinumConfigured: () => true,
  platinumRegionControlPlane: () => undefined,
  platinumFetch: async () => {
    storageCalls++;
    if (failNext) return new Response('{"error":"invalid_path"}', { status: 400 });
    return new Response(JSON.stringify({ entries: storageEntries }), { status: 200 });
  },
}));
mock.module('../shared/db', () => ({ db: {}, transaction: async () => {} }));

const { listVolumeFiles, bustVolumeListCache } = await import('./volumes');

// `unfenced` skips the write fence's DB read: the fence is not this test's subject.
const volume = { name: 'kd-test', region: null, unfenced: true as const };

beforeEach(() => {
  storageCalls = 0;
  bustVolumeListCache(volume.name);
});

describe('volume list cache (KRTX-4671)', () => {
  test('two back-to-back lists of one folder hit storage once', async () => {
    const a = await listVolumeFiles(volume, '/Users/probe', false);
    const b = await listVolumeFiles(volume, '/Users/probe', false);
    expect(a).toEqual(b);
    expect(storageCalls).toBe(1);
  });

  test('concurrent lists share the in-flight storage call', async () => {
    const [a, b] = await Promise.all([listVolumeFiles(volume, '/x', false), listVolumeFiles(volume, '/x', false)]);
    expect(a).toEqual(b);
    expect(storageCalls).toBe(1);
  });

  test('a different folder is its own listing', async () => {
    await listVolumeFiles(volume, '/x', false);
    await listVolumeFiles(volume, '/y', false);
    expect(storageCalls).toBe(2);
  });

  test('a write busts the volume: the next list re-reads storage', async () => {
    await listVolumeFiles(volume, '/x', false);
    const beforeWrite = storageCalls;
    // The write path busts through call()'s non-GET branch — the same helper
    // volume writes use — so exercise that, not the exported bust alone.
    const { writeVolumeFile } = await import('./volumes');
    await writeVolumeFile(volume, '/x/new.txt', new TextEncoder().encode('data'), { overwrite: false });
    const afterWrite = storageCalls;
    await listVolumeFiles(volume, '/x', false);
    expect(storageCalls).toBe(afterWrite + 1);
    expect(afterWrite).toBe(beforeWrite + 1);
  });

  test('recursive walkers and snapshot reads bypass the cache', async () => {
    await listVolumeFiles(volume, '/x', true);
    await listVolumeFiles(volume, '/x', false, undefined, 'head-123');
    expect(storageCalls).toBe(2);
  });

  test('a failed storage call is not cached: the next list retries', async () => {
    // A 400 refusal (mapped by call(), no GET-retry loop) proves rejections
    // never cache: the retry after it re-reads storage.
    failNext = true;
    try {
      await listVolumeFiles(volume, '/x', false);
      throw new Error('expected a rejection');
    } catch (err) {
      if ((err as Error).message === 'expected a rejection') throw err;
    } finally {
      failNext = false;
    }
    const entries = await listVolumeFiles(volume, '/x', false);
    expect(entries).toEqual(storageEntries);
    expect(storageCalls).toBe(2);
  });
});
