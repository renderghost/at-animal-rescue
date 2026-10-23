import { randomBytes } from 'node:crypto';
import { createDb, IndexStore, schema, searchListings } from '@homeward/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { JetstreamEvent } from './events';
import { processEvent, type ProcessorDependencies } from './processor';

const databaseUrl = process.env.DATABASE_URL;
const createdAt = '2026-10-01T12:00:00.000Z';

describe.runIf(databaseUrl)('processEvent', () => {
  const db = createDb(databaseUrl);
  const store = new IndexStore(db);
  const dids: string[] = [];
  const log = { info: vi.fn(), warn: vi.fn() };

  afterAll(async () => {
    for (const did of dids) await store.deleteRepo(did);
    await db.close();
  });

  function setup(
    resolveHandle: (did: string) => Promise<string | undefined> = async () => 'rescue.example.org',
  ) {
    const did = `did:plc:ix${randomBytes(8).toString('hex')}`;
    dids.push(did);
    const deps: ProcessorDependencies = { store, knownDids: new Set(), resolveHandle, log };
    let time = 1;
    const commit = (
      collection: string,
      rkey: string,
      record?: Record<string, unknown>,
      operation: 'create' | 'update' | 'delete' = record ? 'create' : 'delete',
    ): JetstreamEvent => ({
      kind: 'commit',
      did,
      time_us: time++,
      commit:
        operation === 'delete'
          ? { operation, collection, rkey, rev: 'r' }
          : { operation, collection, rkey, record: record!, cid: `cid${time}`, rev: 'r' },
    });
    const apply = (event: JetstreamEvent) => processEvent(event, deps);
    return { did, deps, commit, apply };
  }

  const org = {
    $type: 'pet.homeward.org.profile',
    displayName: 'Hill Farm Rescue',
    location: { locality: 'Utrecht', country: 'NL', latitude: '52.09', longitude: '5.12' },
    contact: { preferred: 'email', email: 'adopt@hillfarm.example' },
    createdAt,
  };
  const animal = { $type: 'pet.homeward.animal', name: 'Bonnie', species: 'rabbit', createdAt };

  async function seedListing(t: ReturnType<typeof setup>) {
    await t.apply(t.commit('pet.homeward.org.profile', 'self', org));
    await t.apply(t.commit('pet.homeward.animal', 'a1', animal));
    await t.apply(
      t.commit('pet.homeward.listing', 'l1', {
        $type: 'pet.homeward.listing',
        animals: [`at://${t.did}/pet.homeward.animal/a1`],
        status: 'available',
        createdAt,
      }),
    );
    // The organisation isn't approved yet, so look with includeUnmoderated.
    return searchListings(db, { orgDid: t.did, includeUnmoderated: true });
  }

  it('indexes an organisation, its animal and listing, with a verified handle', async () => {
    const t = setup();
    const page = await seedListing(t);
    expect(page.listings).toHaveLength(1);
    expect(page.listings[0]).toMatchObject({
      org: { displayName: 'Hill Farm Rescue', handle: 'rescue.example.org' },
      animals: [{ name: 'Bonnie', species: 'rabbit' }],
    });
    expect(t.deps.knownDids.has(t.did)).toBe(true);
  });

  it('applies updates and deletes', async () => {
    const t = setup();
    await seedListing(t);
    await t.apply(
      t.commit('pet.homeward.animal', 'a1', { ...animal, name: 'Bonnie Blue' }, 'update'),
    );
    let page = await searchListings(db, { orgDid: t.did, includeUnmoderated: true });
    expect(page.listings[0]!.animals[0]!.name).toBe('Bonnie Blue');
    await t.apply(t.commit('pet.homeward.listing', 'l1'));
    page = await searchListings(db, { orgDid: t.did, includeUnmoderated: true });
    expect(page.listings).toEqual([]);
  });

  it('skips records that fail lexicon validation, without storing anything', async () => {
    const t = setup();
    await t.apply(t.commit('pet.homeward.org.profile', 'self', { ...org, displayName: undefined }));
    await t.apply(t.commit('pet.homeward.org.profile', 'not-self', org));
    const rows = await db.select().from(schema.indexOrgs).where(eq(schema.indexOrgs.did, t.did));
    expect(rows).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith('invalid record skipped', expect.anything());
  });

  it('still indexes an organisation when its handle cannot be verified', async () => {
    const t = setup(async () => {
      throw new Error('offline');
    });
    await t.apply(t.commit('pet.homeward.org.profile', 'self', org));
    const [row] = await db.select().from(schema.indexOrgs).where(eq(schema.indexOrgs.did, t.did));
    expect(row).toMatchObject({ displayName: 'Hill Farm Rescue', handle: null });
  });

  it('removes an account that is deactivated, taken down or deleted', async () => {
    const t = setup();
    await seedListing(t);
    await t.apply({
      kind: 'account',
      did: t.did,
      time_us: 99,
      account: { did: t.did, active: false, status: 'deleted', seq: 1, time: createdAt },
    });
    const rows = await db.select().from(schema.indexOrgs).where(eq(schema.indexOrgs.did, t.did));
    expect(rows).toEqual([]);
    expect(t.deps.knownDids.has(t.did)).toBe(false);
  });

  it('follows handle changes for known accounts, checking each one both ways', async () => {
    let current: string | undefined = 'rescue.example.org';
    const t = setup(async () => current);
    const changed: string[] = [];
    t.deps.onOrgChanged = (did) => changed.push(did);
    const identity = (handle: string, seq: number): JetstreamEvent => ({
      kind: 'identity',
      did: t.did,
      time_us: 99 + seq,
      identity: { did: t.did, handle, seq, time: createdAt },
    });
    const handle = async () =>
      (await db.select().from(schema.indexOrgs).where(eq(schema.indexOrgs.did, t.did)))[0]!.handle;

    await t.apply(t.commit('pet.homeward.org.profile', 'self', org));
    current = 'hillfarm.example';
    await t.apply(identity('hillfarm.example', 1));
    expect(await handle()).toBe('hillfarm.example');

    // The event's handle is never taken on trust, e.g. "handle.invalid" from a relay.
    current = undefined;
    await t.apply(identity('handle.invalid', 2));
    expect(await handle()).toBeNull();
    expect(changed).toEqual([t.did, t.did, t.did]);
  });

  it('ignores identity and account events for accounts it does not know, without touching the database', async () => {
    const t = setup();
    const spy = {
      upsertOrg: vi.fn(),
      upsertAnimal: vi.fn(),
      upsertListing: vi.fn(),
      deleteRecord: vi.fn(),
      deleteRepo: vi.fn(),
      updateHandle: vi.fn(),
    };
    await processEvent(
      {
        kind: 'account',
        did: 'did:plc:stranger',
        time_us: 1,
        account: { did: 'did:plc:stranger', active: false, seq: 1, time: createdAt },
      },
      { ...t.deps, store: spy },
    );
    await processEvent(
      {
        kind: 'identity',
        did: 'did:plc:stranger',
        time_us: 2,
        identity: { did: 'did:plc:stranger', handle: 'x.example', seq: 1, time: createdAt },
      },
      { ...t.deps, store: spy },
    );
    for (const method of Object.values(spy)) expect(method).not.toHaveBeenCalled();
  });
});
