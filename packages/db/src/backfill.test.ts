import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { backfillRepo, pdsListRecords, type ListRecords, type RepoPage } from './backfill';
import { createDb } from './index';
import { IndexStore } from './index-store';
import { findOrg } from './orgs';
import { indexAnimals, indexListings } from './schema';
import { getListing } from './search';

const databaseUrl = process.env.DATABASE_URL;
const createdAt = '2026-10-01T12:00:00.000Z';

/** A repository as listRecords would page through it, two records a page. */
function repo(records: Record<string, RepoPage['records']>): ListRecords {
  return async (collection, cursor) => {
    const all = records[collection] ?? [];
    const start = Number(cursor ?? 0);
    const page = all.slice(start, start + 2);
    return { records: page, ...(start + 2 < all.length && { cursor: String(start + 2) }) };
  };
}

describe.runIf(databaseUrl)('backfillRepo', () => {
  const db = createDb(databaseUrl);
  const index = new IndexStore(db);
  const dids: string[] = [];
  const newDid = () => {
    const did = `did:plc:backfill${randomBytes(6).toString('hex')}`;
    dids.push(did);
    return did;
  };

  afterAll(async () => {
    for (const did of dids) await index.deleteRepo(did);
    await db.close();
  });

  const profile = {
    $type: 'pet.homeward.org.profile',
    displayName: 'Hill Farm Rescue',
    location: { locality: 'Utrecht', country: 'NL', latitude: '52.09', longitude: '5.12' },
    contact: { preferred: 'email', email: 'adopt@hillfarm.example' },
    createdAt,
  };
  const animal = (name: string) => ({
    $type: 'pet.homeward.animal',
    name,
    species: 'rabbit',
    createdAt,
  });
  const listing = (animals: string[]) => ({
    $type: 'pet.homeward.listing',
    animals,
    status: 'available',
    createdAt,
  });

  it('indexes a repository, paging, and skips what fails validation', async () => {
    const did = newDid();
    const animals = ['3m5z2kq5qnsaa', '3m5z2kq5qnsab', '3m5z2kq5qnsac'].map((rkey, i) => ({
      uri: `at://${did}/pet.homeward.animal/${rkey}`,
      cid: `cid-a${i}`,
      value: animal(`Bun ${i}`),
    }));
    const result = await backfillRepo(
      db,
      did,
      repo({
        'pet.homeward.org.profile': [
          { uri: `at://${did}/pet.homeward.org.profile/self`, cid: 'cid-p', value: profile },
          { uri: `at://${did}/pet.homeward.org.profile/other`, cid: 'cid-x', value: profile },
        ],
        'pet.homeward.animal': [
          ...animals,
          // Wrong account, and not an animal at all.
          {
            uri: `at://did:plc:someoneelse/pet.homeward.animal/3m5z2kq5qnsad`,
            cid: 'c',
            value: animal('X'),
          },
          { uri: `at://${did}/pet.homeward.animal/3m5z2kq5qnsae`, cid: 'c', value: { name: 1 } },
        ],
        'pet.homeward.listing': [
          {
            uri: `at://${did}/pet.homeward.listing/3m5z2kq5qnsla`,
            cid: 'cid-l',
            value: listing([animals[0]!.uri]),
          },
        ],
      }),
      'hillfarm.example',
    );
    expect(result).toEqual({ org: true, animals: 3, listings: 1, skipped: 3, removed: 0 });
    expect(await findOrg(db, { did })).toMatchObject({ handle: 'hillfarm.example' });
    expect(await getListing(db, `at://${did}/pet.homeward.listing/3m5z2kq5qnsla`)).toMatchObject({
      animals: [expect.objectContaining({ name: 'Bun 0' })],
    });
  });

  it('removes what the repository no longer has', async () => {
    const did = newDid();
    const a = `at://${did}/pet.homeward.animal/3m5z2kq5qnsaa`;
    const gone = `at://${did}/pet.homeward.animal/3m5z2kq5qnsab`;
    const l = `at://${did}/pet.homeward.listing/3m5z2kq5qnsla`;
    const records = {
      'pet.homeward.org.profile': [
        { uri: `at://${did}/pet.homeward.org.profile/self`, cid: 'p', value: profile },
      ],
      'pet.homeward.animal': [
        { uri: a, cid: 'a', value: animal('Stays') },
        { uri: gone, cid: 'b', value: animal('Goes') },
      ],
      'pet.homeward.listing': [{ uri: l, cid: 'l', value: listing([gone]) }],
    };
    await backfillRepo(db, did, repo(records));

    const result = await backfillRepo(
      db,
      did,
      repo({
        ...records,
        'pet.homeward.animal': [records['pet.homeward.animal'][0]!],
        'pet.homeward.listing': [],
      }),
    );
    expect(result).toMatchObject({ org: true, animals: 1, listings: 0, removed: 2 });
    const left = await db
      .select({ uri: indexAnimals.uri })
      .from(indexAnimals)
      .where(eq(indexAnimals.did, did));
    expect(left.map((row) => row.uri)).toEqual([a]);

    // No profile any more: the organisation leaves the index too.
    expect(await backfillRepo(db, did, repo({}))).toMatchObject({ org: false, removed: 2 });
    expect(await findOrg(db, { did })).toBeUndefined();
    expect(await db.select().from(indexListings).where(eq(indexListings.did, did))).toEqual([]);
  });

  it('changes nothing when the PDS fails', async () => {
    const did = newDid();
    await backfillRepo(
      db,
      did,
      repo({
        'pet.homeward.org.profile': [
          { uri: `at://${did}/pet.homeward.org.profile/self`, cid: 'p', value: profile },
        ],
      }),
    );
    const failing: ListRecords = async (collection) => {
      if (collection === 'pet.homeward.listing') throw new Error('PDS down');
      return { records: [] };
    };
    await expect(backfillRepo(db, did, failing)).rejects.toThrow('PDS down');
    expect(await findOrg(db, { did })).toBeDefined();
  });

  it('pages listRecords over XRPC', async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: URL) => {
      calls.push(url.toString());
      return new Response(JSON.stringify({ records: [], cursor: undefined }), { status: 200 });
    }) as unknown as typeof fetch;
    await pdsListRecords(
      fetchFn,
      'https://pds.example',
      'did:plc:abc',
    )('pet.homeward.animal', 'c1');
    expect(calls).toEqual([
      'https://pds.example/xrpc/com.atproto.repo.listRecords?repo=did%3Aplc%3Aabc&collection=pet.homeward.animal&limit=100&cursor=c1',
    ]);
  });
});
