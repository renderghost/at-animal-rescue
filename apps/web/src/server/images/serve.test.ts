import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { serveImage, type ServeDeps } from './serve';

const did = 'did:plc:hillfarm';
const cid = 'bafkreihr7jqqzvtzzhydfwijovqpyqejbjrotivnd3dhafrack6httkoaq';

async function photo(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#c87828' } })
    .withExif({ IFD0: { Make: 'PhoneCo' } })
    .jpeg()
    .toBuffer();
}

function setUp(original: Buffer | 'notFound' | Error, isPublic = true) {
  const files = new Map<string, Buffer>();
  const deps = {
    isPublic: vi.fn(async () => isPublic),
    fetchBlob: vi.fn(async () => {
      if (original instanceof Error) throw original;
      return original;
    }),
    cache: {
      get: async (key: string) => files.get(key),
      put: async (key: string, bytes: Buffer) => void files.set(key, bytes),
      delete: async (keys: string[]) => keys.forEach((key) => files.delete(key)),
    },
  } satisfies ServeDeps;
  return { deps, files };
}

describe('serveImage', () => {
  it('fetches once, resizes to WebP without metadata, and caches every width', async () => {
    const { deps, files } = setUp(await photo(2000, 1500));
    const first = await serveImage(deps, did, cid, 800);
    expect(first.status).toBe(200);
    if (first.status !== 200) return;
    const meta = await sharp(first.body).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 800, height: 600 });
    expect(meta.exif).toBeUndefined();

    await serveImage(deps, did, cid, 800);
    await serveImage(deps, did, cid, 400);
    expect(deps.fetchBlob).toHaveBeenCalledTimes(1);
    expect([...files.keys()].sort()).toEqual([
      `${did}/${cid}/400`,
      `${did}/${cid}/800`,
      `${did}/${cid}/original`,
    ]);
  });

  it('never enlarges a small photo', async () => {
    const { deps } = setUp(await photo(640, 480));
    const result = await serveImage(deps, did, cid, 1600);
    expect(result.status === 200 && (await sharp(result.body).metadata()).width).toBe(640);
  });

  it('shares one fetch between requests arriving together', async () => {
    const { deps } = setUp(await photo(1000, 1000));
    await Promise.all([1, 2, 3].map(() => serveImage(deps, did, cid, 400)));
    expect(deps.fetchBlob).toHaveBeenCalledTimes(1);
  });

  it('refuses photos that are no longer public, and forgets them', async () => {
    const { deps, files } = setUp(await photo(1000, 1000), false);
    files.set(`${did}/${cid}/400`, Buffer.from('cached before the takedown'));
    files.set(`${did}/${cid}/original`, Buffer.from('original'));
    expect(await serveImage(deps, did, cid, 400)).toEqual({ status: 404 });
    expect(files.size).toBe(0);
    expect(deps.fetchBlob).not.toHaveBeenCalled();
  });

  it('reports a missing blob as not found and an unreachable PDS as a bad gateway', async () => {
    expect(await serveImage(setUp('notFound').deps, did, cid, 400)).toEqual({ status: 404 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await serveImage(setUp(new Error('down')).deps, did, cid, 400)).toEqual({ status: 502 });
    warn.mockRestore();
    expect(await serveImage(setUp(Buffer.from('not an image')).deps, did, cid, 400)).toEqual({
      status: 404,
    });
  });
});
