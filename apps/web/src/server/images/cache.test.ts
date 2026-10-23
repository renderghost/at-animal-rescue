import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageCache } from './cache';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function newCache(maxBytes: number) {
  const dir = await mkdtemp(join(tmpdir(), 'homeward-images-'));
  dirs.push(dir);
  return new ImageCache(dir, maxBytes);
}

describe('ImageCache', () => {
  it('stores, returns and deletes files', async () => {
    const cache = await newCache(1_000_000);
    await cache.put('did:plc:a/bafy/400', Buffer.from('small'));
    expect(await cache.get('did:plc:a/bafy/400')).toEqual(Buffer.from('small'));
    expect(await cache.get('did:plc:a/bafy/800')).toBeUndefined();
    await cache.delete(['did:plc:a/bafy/400', 'did:plc:a/bafy/800']);
    expect(await cache.get('did:plc:a/bafy/400')).toBeUndefined();
  });

  it('removes the least recently used files when over its cap', async () => {
    const cache = await newCache(250);
    const file = Buffer.alloc(100);
    await cache.put('old', file);
    await cache.put('used', file);
    await cache.put('new', file);
    // Make "old" and "used" older than "new", then use "used" again.
    const past = new Date(Date.now() - 60_000);
    for (const key of ['old', 'used']) {
      const path = (cache as unknown as { path(k: string): string }).path(key);
      await utimes(path, past, past);
    }
    await cache.get('used');
    await cache.prune();
    expect(await cache.get('old')).toBeUndefined();
    expect(await cache.get('used')).toBeDefined();
    expect(await cache.get('new')).toBeDefined();
  });
});
