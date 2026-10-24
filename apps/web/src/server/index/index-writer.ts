import 'server-only';
import { getHandle, IdResolver } from '@atproto/identity';
import { backfillRepo, findOrg, IndexStore, pdsListRecords } from '@homeward/db';
import { safeFetch } from '../auth/fetch';
import { getDb } from '../db';
import type { WriteThroughDeps } from './write-through';

// Handle and DID resolution use @atproto/identity's built-in SSRF-protected fetch.
const idResolver = new IdResolver({ timeout: 5000 });

/** The account's handle, only if it points back to the same DID (as the indexer checks). */
export async function verifiedHandle(did: string): Promise<string | undefined> {
  const doc = await idResolver.did.resolve(did);
  const handle = doc ? getHandle(doc) : undefined;
  if (!handle) return undefined;
  return (await idResolver.handle.resolve(handle)) === did ? handle.toLowerCase() : undefined;
}

export function writeThroughDeps(): WriteThroughDeps {
  return { store: new IndexStore(getDb()), verifiedHandle };
}

/**
 * On sign-in (#24): an account the index doesn't know yet is backfilled from its PDS, so
 * Homeward records made elsewhere, or missed while the indexer was down, show up. Best
 * effort, after the response.
 */
export async function backfillOnSignIn(did: string, pds: string): Promise<void> {
  try {
    const db = getDb();
    if (await findOrg(db, { did })) return;
    const handle = await verifiedHandle(did).catch(() => undefined);
    await backfillRepo(db, did, pdsListRecords(safeFetch, pds, did), handle);
  } catch (err) {
    console.warn('Backfill on sign-in failed; the indexer or a manual backfill can catch up', err);
  }
}
