import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageCache } from './cache';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function newDir() {
  const dir = await mkdtemp(join(tmpdir(), 'homeward-images-'));
  dirs.push(dir);
  return dir;
}

describe('ImageCache', () => {
  it('stores, returns and deletes files', async () => {
    const cache = new ImageCache(await newDir(), 1_000_000);
    await cache.put('did:plc:a/bafy/400', Buffer.from('small'));
    expect(await cache.get('did:plc:a/bafy/400')).toEqual(Buffer.from('small'));
    expect(await cache.get('did:plc:a/bafy/800')).toBeUndefined();
    await cache.delete(['did:plc:a/bafy/400', 'did:plc:a/bafy/800']);
    expect(await cache.get('did:plc:a/bafy/400')).toBeUndefined();
  });

  it('removes the least recently used files when over its cap', async () => {
    // Filled through a roomy cache: put() prunes in the background, and with a small cap
    // that could run mid-test and remove a file with the same timestamp as "old".
    const dir = await newDir();
    const roomy = new ImageCache(dir, 1_000_000);
    const file = Buffer.alloc(100);
    for (const key of ['old', 'used', 'new']) await roomy.put(key, file);
    const cache = new ImageCache(dir, 250);
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
