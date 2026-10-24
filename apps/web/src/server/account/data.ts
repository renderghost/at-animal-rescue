import 'server-only';
import type { Client } from '@atproto/lex';
import { AccountDataStore, IndexStore, photoCidsOf } from '@homeward/db';
import { pet } from '@homeward/lexicons';
import type { Role } from '../onboarding/role';
import { getDb, getKeyring } from '../db';
import { IMAGE_CACHE_KEYS } from '../images/serve';
import { getImageCache } from '../images/image-cache';

export function accountData() {
  return new AccountDataStore(getDb(), getKeyring());
}

/** Deletes every record of one collection from the account, a page at a time. */
async function deleteAll(
  list: () => Promise<{ records: Array<{ uri: string }> }>,
  remove: (rkey: string) => Promise<unknown>,
): Promise<void> {
  for (;;) {
    const { records } = await list();
    if (records.length === 0) return;
    for (const { uri } of records) await remove(uri.split('/').pop()!);
  }
}

const missing = (err: unknown) => (err as { error?: unknown }).error === 'RecordNotFound';

/**
 * Deletes the account's public Homeward records from its own repository (#46): an
 * organisation's listings, animals and profile, or an adopter's public profile. Nothing
 * else in the account is touched. False if the PDS couldn't be reached; safe to retry.
 */
export async function deletePublicRecords(client: Client, role: Role): Promise<boolean> {
  try {
    if (role === 'organisation') {
      await deleteAll(
        () => client.list(pet.homeward.listing, { limit: 100 }),
        (rkey) => client.delete(pet.homeward.listing, { rkey }),
      );
      await deleteAll(
        () => client.list(pet.homeward.animal, { limit: 100 }),
        (rkey) => client.delete(pet.homeward.animal, { rkey }),
      );
      await client.delete(pet.homeward.org.profile).catch((err) => {
        if (!missing(err)) throw err;
      });
    } else {
      await client.delete(pet.homeward.adopter.profile).catch((err) => {
        if (!missing(err)) throw err;
      });
    }
    return true;
  } catch (err) {
    console.warn('Could not delete public records from the account', err);
    return false;
  }
}

/**
 * Takes an organisation out of the index at once, rather than waiting for the network to
 * report the deletes, and drops its photos from the disk cache.
 */
export async function purgeFromIndex(did: string): Promise<void> {
  const db = getDb();
  const cids = await photoCidsOf(db, did);
  await new IndexStore(db).deleteRepo(did);
  await getImageCache().delete(cids.flatMap((cid) => IMAGE_CACHE_KEYS(did, cid)));
}
