import { isValidDid } from '@atproto/syntax';
import { isAdmin } from '@/server/admin/admins';
import { getCurrentUser } from '@/server/auth/session';
import { fetchPublicBlob } from '@/server/images/blob-source';

const CID = /^b[a-z2-7]{20,100}$/;
const notFound = () =>
  new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

/** The file types photos are stored as, by their first bytes. */
function typeOf(bytes: Buffer): string | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  return undefined;
}

/**
 * A photo for a moderator judging a listing that isn't public yet (#43). Moderators only,
 * and never cached anywhere shared: the public image route (#26) won't serve these.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ did: string; cid: string }> },
) {
  const user = await getCurrentUser();
  if (!isAdmin(user?.did)) return notFound();
  const { did: rawDid, cid } = await params;
  const did = decodeURIComponent(rawDid);
  if (!isValidDid(did) || !CID.test(cid)) return notFound();
  try {
    const bytes = await fetchPublicBlob(did, cid);
    const type = bytes === 'notFound' ? undefined : typeOf(bytes);
    if (bytes === 'notFound' || !type) return notFound();
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': type, 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
