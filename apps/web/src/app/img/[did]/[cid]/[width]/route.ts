import { isValidDid } from '@atproto/syntax';
import { isPublicPhoto } from '@homeward/db';
import { isImageWidth } from '@/lib/images';
import { getDb } from '@/server/db';
import { fetchPublicBlob } from '@/server/images/blob-source';
import { getImageCache } from '@/server/images/image-cache';
import { serveImage } from '@/server/images/serve';

const CID = /^b[a-z2-7]{20,100}$/;

/**
 * A public photo at one width (#26): only for animals in a listing the public can see, from
 * Homeward's disk cache or fetched once from the organisation's PDS and resized to WebP.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ did: string; cid: string; width: string }> },
) {
  const { did: rawDid, cid, width: rawWidth } = await params;
  const did = decodeURIComponent(rawDid);
  const width = Number(rawWidth);
  const notFound = { status: 404, headers: { 'Cache-Control': 'no-store' } };
  if (!isValidDid(did) || !CID.test(cid) || !isImageWidth(width)) {
    return new Response(null, notFound);
  }

  const result = await serveImage(
    {
      isPublic: (d, c) => isPublicPhoto(getDb(), d, c),
      fetchBlob: fetchPublicBlob,
      cache: getImageCache(),
    },
    did,
    cid,
    width,
  );
  if (result.status !== 200) {
    return new Response(null, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  }
  return new Response(new Uint8Array(result.body), {
    headers: {
      'Content-Type': result.contentType,
      // The content never changes (it's addressed by CID), but a takedown must reach browsers
      // within a day and shared caches within an hour; our own check applies at once.
      'Cache-Control': 'public, max-age=86400, s-maxage=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
