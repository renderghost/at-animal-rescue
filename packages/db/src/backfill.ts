import { jsonToLex } from '@atproto/lex';
import { pet } from '@homeward/lexicons';
import { and, eq, notInArray } from 'drizzle-orm';
import type { Db } from './index';
import { IndexStore, parseAtUri } from './index-store';
import { indexAnimals, indexListings, indexOrgs } from './schema';

export const BACKFILL_COLLECTIONS = [
  'pet.homeward.org.profile',
  'pet.homeward.animal',
  'pet.homeward.listing',
] as const;
type Collection = (typeof BACKFILL_COLLECTIONS)[number];

export interface RepoPage {
  records: Array<{ uri: string; cid: string; value: unknown }>;
  cursor?: string;
}

/** One page of an account's records in a collection (com.atproto.repo.listRecords). */
export type ListRecords = (collection: Collection, cursor?: string) => Promise<RepoPage>;

export interface BackfillResult {
  org: boolean;
  animals: number;
  listings: number;
  /** Records that failed validation, or didn't belong where they were. */
  skipped: number;
  /** Index rows the repository no longer has. */
  removed: number;
}

/** Enough for any rescue; stops a hostile repository from making us page for ever. */
const MAX_PAGES = 100;

/** listRecords over plain XRPC against the account's PDS, with the caller's fetch. */
export function pdsListRecords(
  fetchFn: typeof globalThis.fetch,
  pds: string,
  did: string,
): ListRecords {
  return async (collection, cursor) => {
    const url = new URL('/xrpc/com.atproto.repo.listRecords', pds);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', collection);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetchFn(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`listRecords ${collection}: HTTP ${response.status}`);
    return (await response.json()) as RepoPage;
  };
}

async function fetchAll(listRecords: ListRecords, collection: Collection) {
  const records: RepoPage['records'] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await listRecords(collection, cursor);
    records.push(...result.records);
    if (!result.cursor || result.records.length === 0) break;
    cursor = result.cursor;
  }
  return records;
}

/**
 * Brings the index in line with one account's repository (#24): its organisation profile,
 * animals and listings are validated and indexed, and whatever is indexed for it that the
 * repository no longer has is removed. Everything is fetched before anything is written,
 * so an unreachable PDS changes nothing. Used on first sign-in and for recovery.
 */
export async function backfillRepo(
  db: Db,
  did: string,
  listRecords: ListRecords,
  handle?: string,
): Promise<BackfillResult> {
  const [profiles, animals, listings] = await Promise.all(
    BACKFILL_COLLECTIONS.map((collection) => fetchAll(listRecords, collection)),
  );
  let skipped = 0;
  // Records are untrusted network input, exactly as from Jetstream.
  const valid = <T>(
    records: RepoPage['records'],
    collection: Collection,
    schema: { $safeParse(value: unknown): { success: boolean; value?: T } },
  ) =>
    records.flatMap(({ uri, cid, value }) => {
      try {
        const address = parseAtUri(uri);
        const parsed = schema.$safeParse(jsonToLex(value as Parameters<typeof jsonToLex>[0]));
        if (address.did === did && address.collection === collection && parsed.success) {
          return [{ uri, cid, record: parsed.value as T, rkey: address.rkey }];
        }
      } catch {
        // Not an AT URI, or not atproto JSON: skipped below.
      }
      skipped++;
      return [];
    });

  const validProfiles = valid(profiles!, 'pet.homeward.org.profile', pet.homeward.org.profile);
  // An organisation profile only counts under the record key "self".
  const profile = validProfiles.find((found) => found.rkey === 'self');
  skipped += validProfiles.filter((found) => found.rkey !== 'self').length;
  const validAnimals = valid(animals!, 'pet.homeward.animal', pet.homeward.animal);
  const validListings = valid(listings!, 'pet.homeward.listing', pet.homeward.listing);

  const store = new IndexStore(db);
  let removed = 0;
  if (profile) {
    await store.upsertOrg(did, profile.record, profile.cid, handle);
  } else {
    const [indexed] = await db
      .select({ did: indexOrgs.did })
      .from(indexOrgs)
      .where(eq(indexOrgs.did, did));
    if (indexed) {
      await store.deleteRecord(`at://${did}/pet.homeward.org.profile/self`);
      removed++;
    }
  }
  for (const animal of validAnimals)
    await store.upsertAnimal(animal.uri, animal.record, animal.cid);
  for (const listing of validListings) {
    await store.upsertListing(listing.uri, listing.record, listing.cid);
  }

  const keep = (uris: string[]) => (uris.length > 0 ? uris : ['']);
  removed += (
    await db
      .delete(indexListings)
      .where(
        and(
          eq(indexListings.did, did),
          notInArray(indexListings.uri, keep(validListings.map((l) => l.uri))),
        ),
      )
      .returning({ uri: indexListings.uri })
  ).length;
  removed += (
    await db
      .delete(indexAnimals)
      .where(
        and(
          eq(indexAnimals.did, did),
          notInArray(indexAnimals.uri, keep(validAnimals.map((a) => a.uri))),
        ),
      )
      .returning({ uri: indexAnimals.uri })
  ).length;

  return {
    org: Boolean(profile),
    animals: validAnimals.length,
    listings: validListings.length,
    skipped,
    removed,
  };
}
