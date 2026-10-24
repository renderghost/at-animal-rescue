import 'server-only';
import { getPds, IdResolver, MemoryCache } from '@atproto/identity';
import { safeFetch } from '../auth/fetch';
import { safePdsOrigin } from '../auth/identity';

const resolver = new IdResolver({ timeout: 5000, didCache: new MemoryCache() });
/** Far more than any record of ours. */
const MAX_RECORD_BYTES = 100 * 1024;

/** Where an account's repository lives, from its DID document, if it's a host we'll call. */
export async function pdsOriginOf(did: string): Promise<string | undefined> {
  const doc = await resolver.did.resolve(did);
  const endpoint = doc ? getPds(doc) : undefined;
  return endpoint ? safePdsOrigin(endpoint) : undefined;
}

/** A record from an account's public repository; undefined when it has none. */
export async function fetchPublicRecord(
  did: string,
  collection: string,
  rkey: string,
): Promise<unknown> {
  const origin = await pdsOriginOf(did);
  if (!origin) return undefined;
  const url = new URL('/xrpc/com.atproto.repo.getRecord', origin);
  url.searchParams.set('repo', did);
  url.searchParams.set('collection', collection);
  url.searchParams.set('rkey', rkey);
  const response = await safeFetch(url, { redirect: 'error' });
  // A PDS answers 400 (RecordNotFound) or 404 for a record it doesn't have.
  if (response.status === 400 || response.status === 404) return undefined;
  if (!response.ok) throw new Error(`PDS responded ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_RECORD_BYTES) throw new Error('Record too large');
  return (JSON.parse(text) as { value?: unknown }).value;
}
