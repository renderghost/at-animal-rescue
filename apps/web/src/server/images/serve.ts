import sharp from 'sharp';
import { IMAGE_WIDTHS, type ImageWidth } from '@/lib/images';
import type { ImageCache } from './cache';

export interface ServeDeps {
  /** Whether the photo may be shown publicly now (#26). */
  isPublic(did: string, cid: string): Promise<boolean>;
  /** The original file from the organisation's PDS, checked against its CID. */
  fetchBlob(did: string, cid: string): Promise<Buffer | 'notFound'>;
  cache: Pick<ImageCache, 'get' | 'put' | 'delete'>;
}

export type ServedImage =
  { status: 200; body: Buffer; contentType: 'image/webp' } | { status: 404 } | { status: 502 };

const key = (did: string, cid: string, size: ImageWidth | 'original') => `${did}/${cid}/${size}`;

/** Every cache entry of one photo: each width and the original. */
export const IMAGE_CACHE_KEYS = (did: string, cid: string) =>
  [...IMAGE_WIDTHS, 'original' as const].map((size) => key(did, cid, size));
const inFlight = new Map<string, Promise<ServedImage>>();

/** Resizes to the width, never enlarging; WebP drops any metadata the original had. */
async function resize(original: Buffer, width: ImageWidth): Promise<Buffer | undefined> {
  try {
    return await sharp(original, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    return undefined;
  }
}

/**
 * A public photo at one width: checked as public on every request, then from the disk cache,
 * else fetched once from the PDS (the original is cached too, for the other widths).
 */
export async function serveImage(
  deps: ServeDeps,
  did: string,
  cid: string,
  width: ImageWidth,
): Promise<ServedImage> {
  if (!(await deps.isPublic(did, cid))) {
    // Withdrawn, hidden or deleted: nothing of it stays on our disk.
    await deps.cache.delete(IMAGE_CACHE_KEYS(did, cid));
    return { status: 404 };
  }
  const cached = await deps.cache.get(key(did, cid, width));
  if (cached) return { status: 200, body: cached, contentType: 'image/webp' };

  const id = key(did, cid, width);
  let pending = inFlight.get(id);
  if (!pending) {
    pending = produce(deps, did, cid, width).finally(() => inFlight.delete(id));
    inFlight.set(id, pending);
  }
  return pending;
}

async function produce(
  deps: ServeDeps,
  did: string,
  cid: string,
  width: ImageWidth,
): Promise<ServedImage> {
  let original = await deps.cache.get(key(did, cid, 'original'));
  if (!original) {
    let fetched: Buffer | 'notFound';
    try {
      fetched = await deps.fetchBlob(did, cid);
    } catch (err) {
      console.warn('Could not fetch a photo from its PDS', { did, cid, err });
      return { status: 502 };
    }
    if (fetched === 'notFound') return { status: 404 };
    original = fetched;
    await deps.cache.put(key(did, cid, 'original'), original);
  }
  const body = await resize(original, width);
  if (!body) return { status: 404 };
  await deps.cache.put(key(did, cid, width), body);
  return { status: 200, body, contentType: 'image/webp' };
}
