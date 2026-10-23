import { draftFiles, isAnimalKey, loadAnimal, photoCid } from '@/server/animals/animals';
import { requireOrganisation } from '@/server/animals/current-org';
import { privateBlobs } from '@/server/animals/media';
import { getPdsSession } from '@/server/auth/session';

const headers = (mimeType: string) => ({
  'Content-Type': mimeType,
  // Addressed by content, so it never changes; private because only its organisation sees it.
  'Cache-Control': 'private, max-age=86400, immutable',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'",
});

/**
 * An animal's photo for its organisation's editor: a draft's from Homeward's private store,
 * a published animal's from the PDS. Public delivery, with caching and sizes, is #26.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rkey: string; cid: string }> },
) {
  const { rkey, cid } = await params;
  if (!isAnimalKey(rkey) || !/^[a-z2-7]{20,100}$/.test(cid))
    return new Response(null, { status: 404 });
  const { did, client } = await requireOrganisation();
  const animal = await loadAnimal(did, client, rkey);
  if (animal.kind !== 'found')
    return new Response(null, { status: animal.kind === 'missing' ? 404 : 503 });
  const photo = animal.record.photos?.find((p) => photoCid(p) === cid);
  if (!photo) return new Response(null, { status: 404 });

  if (!animal.published) {
    const blob = await privateBlobs().get({ did, record: draftFiles(rkey), cid });
    return blob
      ? new Response(new Uint8Array(blob.bytes), { headers: headers(blob.mimeType) })
      : new Response(null, { status: 404 });
  }
  const session = await getPdsSession();
  const response = await session
    ?.fetchHandler(`/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${cid}`, {
      method: 'GET',
    })
    .catch(() => undefined);
  if (!response?.ok) return new Response(null, { status: 502 });
  return new Response(response.body, { headers: headers(photo.image.mimeType ?? 'image/jpeg') });
}
