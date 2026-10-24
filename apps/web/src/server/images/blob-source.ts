import 'server-only';
import { cidForRawBytes } from '@atproto/lex';
import { pdsOriginOf } from '../atproto/public-repo';
import { safeFetch } from '../auth/fetch';

/** The lexicon allows photos up to 2 MB; anything much larger isn't one of ours. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Reads a response body, refusing more than the limit. */
async function readLimited(response: Response, limit: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > limit) throw new Error('Blob too large');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > limit) throw new Error('Blob too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * A photo's original file from the organisation's own PDS (found through its DID document),
 * checked against the CID it was asked for, so a PDS can't swap in other content.
 */
export async function fetchPublicBlob(did: string, cid: string): Promise<Buffer | 'notFound'> {
  const origin = await pdsOriginOf(did);
  if (!origin) return 'notFound';
  const url = new URL('/xrpc/com.atproto.sync.getBlob', origin);
  url.searchParams.set('did', did);
  url.searchParams.set('cid', cid);
  // No redirects: the safe fetch refuses them, and a PDS serves its own blobs.
  const response = await safeFetch(url, { redirect: 'error' });
  // A PDS answers 400 (BlobNotFound) or 404 for a blob it doesn't have, e.g. after deletion.
  if (response.status === 400 || response.status === 404) return 'notFound';
  if (!response.ok) throw new Error(`PDS responded ${response.status}`);
  const bytes = await readLimited(response, MAX_BYTES);
  if ((await cidForRawBytes(bytes)).toString() !== cid)
    throw new Error('Blob does not match its CID');
  return bytes;
}
