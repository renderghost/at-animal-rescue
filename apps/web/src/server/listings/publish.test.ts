import { cidForRawBytes } from '@atproto/lex';
import { describe, expect, it, vi } from 'vitest';
import { animalUri, mergeListing } from './listing-form';
import { publishListing, PublishError, type PublishDeps } from './publish';

vi.mock('server-only', () => ({}));

const did = 'did:plc:hillfarm';
const BONNIE = '3m5z2kq5qns2a';
const LISTING = '3m5z2kq5qns2l';
const BONNIE_FILES = `pet.homeward.animal/${BONNIE}`;

/** In-memory stand-ins for the private store, the private blob store and the PDS. */
async function setUp() {
  const bytes = Buffer.from('pretend JPEG of Bonnie');
  const ref = await cidForRawBytes(bytes);
  const records = new Map<string, unknown>();
  const files = new Map<string, { mimeType: string; bytes: Buffer }>();
  const pds = new Map<string, unknown>();
  const calls: string[] = [];
  const fail = { upload: false, listing: false };

  records.set(`pet.homeward.animal/${BONNIE}`, {
    $type: 'pet.homeward.animal',
    name: 'Bonnie',
    species: 'rabbit',
    photos: [
      {
        image: { $type: 'blob', ref, mimeType: 'image/jpeg', size: bytes.length },
        alt: 'Bonnie on the grass',
      },
    ],
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  files.set(`${BONNIE_FILES}/${ref}`, { mimeType: 'image/jpeg', bytes });

  const deps: PublishDeps = {
    store: {
      get: async (_did: string, collection: string, rkey: string) =>
        records.get(`${collection}/${rkey}`),
      delete: async (_did: string, collection: string, rkey: string) =>
        records.delete(`${collection}/${rkey}`),
    } as never,
    blobs: {
      get: async ({ record, cid }: { record: string; cid: string }) =>
        files.get(`${record}/${cid}`),
      delete: async (_did: string, record: string) => {
        for (const key of files.keys()) if (key.startsWith(`${record}/`)) files.delete(key);
      },
    } as never,
    client: {
      uploadBlob: async (data: Buffer, { encoding }: { encoding: string }) => {
        calls.push('uploadBlob');
        if (fail.upload) throw new Error('PDS down');
        const cid = await cidForRawBytes(data);
        return { body: { blob: { $type: 'blob', ref: cid, mimeType: encoding, size: 22 } } };
      },
      put: async (ns: { $type: string }, record: unknown, { rkey }: { rkey: string }) => {
        calls.push(`put ${ns.$type}`);
        if (ns.$type === 'pet.homeward.listing' && fail.listing) throw new Error('PDS down');
        pds.set(`${ns.$type}/${rkey}`, record);
      },
    } as never,
  };
  const listing = mergeListing(
    undefined,
    { animals: [animalUri(did, BONNIE)], adoptionFee: { kind: 'none' } },
    undefined,
  );
  records.set(`pet.homeward.listing/${LISTING}`, { $type: 'pet.homeward.listing', ...listing });
  return { deps, records, files, pds, calls, fail, listing, ref };
}

describe('publishListing', () => {
  it('publishes the draft animals and their photos first, then the listing', async () => {
    const { deps, records, files, pds, calls, listing, ref } = await setUp();
    await publishListing(deps, did, LISTING, listing, [BONNIE]);

    expect(calls).toEqual(['uploadBlob', 'put pet.homeward.animal', 'put pet.homeward.listing']);
    expect(pds.get(`pet.homeward.animal/${BONNIE}`)).toMatchObject({
      name: 'Bonnie',
      photos: [{ image: { ref }, alt: 'Bonnie on the grass' }],
    });
    expect(pds.get(`pet.homeward.listing/${LISTING}`)).toMatchObject({ status: 'available' });
    expect([...records.keys()]).toEqual([]);
    expect([...files.keys()]).toEqual([]);
  });

  it('keeps every draft when a photo can’t be uploaded', async () => {
    const { deps, records, files, pds, fail, listing } = await setUp();
    fail.upload = true;
    await expect(publishListing(deps, did, LISTING, listing, [BONNIE])).rejects.toEqual(
      new PublishError('unavailable'),
    );
    expect(records.size).toBe(2);
    expect(files.size).toBe(1);
    expect(pds.size).toBe(0);
  });

  it('can be run again after the listing itself failed', async () => {
    const { deps, records, pds, calls, fail, listing } = await setUp();
    fail.listing = true;
    await expect(publishListing(deps, did, LISTING, listing, [BONNIE])).rejects.toEqual(
      new PublishError('unavailable'),
    );
    // Bonnie is public now; the listing is still a draft.
    expect(pds.has(`pet.homeward.animal/${BONNIE}`)).toBe(true);
    expect([...records.keys()]).toEqual([`pet.homeward.listing/${LISTING}`]);

    fail.listing = false;
    calls.length = 0;
    await publishListing(deps, did, LISTING, listing, [BONNIE]);
    expect(calls).toEqual(['put pet.homeward.listing']);
    expect(records.size).toBe(0);
  });

  it('refuses to publish an animal whose photo file is missing', async () => {
    const { deps, files, pds, listing } = await setUp();
    files.clear();
    await expect(publishListing(deps, did, LISTING, listing, [BONNIE])).rejects.toEqual(
      new PublishError('photoMissing'),
    );
    expect(pds.size).toBe(0);
  });
});
