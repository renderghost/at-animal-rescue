import 'server-only';
import { join } from 'node:path';
import { ImageCache } from './cache';

// One cache per server process; kept on globalThis so dev hot reloads share it.
const cache = globalThis as unknown as { homewardImageCache?: ImageCache };

/** The disk cache for public photos: IMAGE_CACHE_DIR, capped at IMAGE_CACHE_MAX_MB. */
export function getImageCache(): ImageCache {
  return (cache.homewardImageCache ??= new ImageCache(
    process.env.IMAGE_CACHE_DIR || join(process.cwd(), '.cache', 'images'),
    (Number(process.env.IMAGE_CACHE_MAX_MB) || 2048) * 1024 * 1024,
  ));
}
