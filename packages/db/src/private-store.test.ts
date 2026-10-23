import { randomBytes } from 'node:crypto';
import type { pet } from '@homeward/lexicons';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { generateKey, parseKeyring } from './crypto';
import { createDb } from './index';
import {
  newRecordKey,
  PostgresPrivateStore,
  PrivateStoreError,
  type RecordAddress,
} from './private-store';
import { privateRecords } from './schema';

// Needs Postgres with migrations applied: `pnpm services:up && pnpm db:migrate`. CI provides one.
const databaseUrl = process.env.DATABASE_URL;

describe.runIf(databaseUrl)('PostgresPrivateStore', () => {
  const db = createDb(databaseUrl);
  const k1 = generateKey();
  const store = new PostgresPrivateStore(db, parseKeyring(`k1:${k1}`, 'k1'));
  const dids: string[] = [];
  const newDid = () => {
    const did = `did:plc:test${randomBytes(8).toString('hex')}`;
    dids.push(did);
    return did;
  };
  const updatedAt = '2026-10-22T12:00:00.000Z';
  const household: pet.homeward.adopter.household.Main = {
    $type: 'pet.homeward.adopter.household',
    children: { present: true, youngestAge: 7 },
    otherAnimals: ['cat'],
    homeType: 'flat',
    hoursAlone: 4,
    updatedAt,
  };

  afterAll(async () => {
    for (const did of dids) await store.deleteAll(did);
    await db.close();
  });

  it('round-trips a record', async () => {
    const did = newDid();
    await store.put(did, 'pet.homeward.adopter.household', 'self', household);
    expect(await store.get(did, 'pet.homeward.adopter.household', 'self')).toEqual(household);
  });

  it('keeps animal drafts privately, under a TID record key', async () => {
    const did = newDid();
    const rkey = newRecordKey();
    const draft: pet.homeward.animal.Main = {
      $type: 'pet.homeward.animal',
      name: 'Bonnie',
      species: 'rabbit',
      birth: { date: '2023-10', estimated: true },
      createdAt: updatedAt,
    };
    await store.put(did, 'pet.homeward.animal', rkey, draft);
    expect(await store.get(did, 'pet.homeward.animal', rkey)).toEqual(draft);
    expect((await store.list(did, 'pet.homeward.animal')).records).toEqual([
      { rkey, value: draft },
    ]);
    await expect(store.put(did, 'pet.homeward.animal', 'self', draft)).rejects.toThrow(
      'Invalid record key',
    );
  });

  it('stores ciphertext, never plaintext', async () => {
    const did = newDid();
    await store.put(did, 'pet.homeward.adopter.household', 'self', household);
    const rows = await db
      .select()
      .from(privateRecords)
      .where(sql`${privateRecords.did} = ${did}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ciphertext.toString('utf8')).not.toContain('youngestAge');
    expect(rows[0]!.keyId).toBe('k1');
  });

  it('overwrites on put', async () => {
    const did = newDid();
    await store.put(did, 'pet.homeward.adopter.household', 'self', household);
    await store.put(did, 'pet.homeward.adopter.household', 'self', { ...household, hoursAlone: 2 });
    expect((await store.get(did, 'pet.homeward.adopter.household', 'self'))?.hoursAlone).toBe(2);
  });

  it('rejects records that fail lexicon validation', async () => {
    await expect(
      store.put(newDid(), 'pet.homeward.adopter.household', 'self', {
        ...household,
        hoursAlone: 30,
      }),
    ).rejects.toThrow(PrivateStoreError);
  });

  it('enforces record-key rules per collection', async () => {
    const did = newDid();
    await expect(
      store.put(did, 'pet.homeward.adopter.household', 'other', household),
    ).rejects.toThrow('Invalid record key');
    await expect(
      store.put(did, 'pet.homeward.adopter.savedSearch', 'not-a-tid', {
        $type: 'pet.homeward.adopter.savedSearch',
        name: 'Rabbits',
        createdAt: updatedAt,
      }),
    ).rejects.toThrow('Invalid record key');
  });

  it('cannot read another user’s ciphertext moved into place', async () => {
    const alice = newDid();
    const mallory = newDid();
    await store.put(alice, 'pet.homeward.adopter.household', 'self', household);
    await db.execute(sql`
      insert into private_records (did, collection, rkey, key_id, iv, ciphertext)
      select ${mallory}, collection, rkey, key_id, iv, ciphertext
      from private_records where did = ${alice}`);
    await expect(store.get(mallory, 'pet.homeward.adopter.household', 'self')).rejects.toThrow();
  });

  it('lists with a cursor, in record-key order', async () => {
    const did = newDid();
    const rkeys: string[] = [];
    for (const name of ['Dogs', 'Cats', 'Rabbits']) {
      const rkey = newRecordKey();
      rkeys.push(rkey);
      await store.put(did, 'pet.homeward.adopter.savedSearch', rkey, {
        $type: 'pet.homeward.adopter.savedSearch',
        name,
        createdAt: updatedAt,
      });
    }
    const first = await store.list(did, 'pet.homeward.adopter.savedSearch', { limit: 2 });
    expect(first.records.map((r) => r.value.name)).toEqual(['Dogs', 'Cats']);
    const second = await store.list(did, 'pet.homeward.adopter.savedSearch', {
      limit: 2,
      cursor: first.cursor,
    });
    expect(second.records.map((r) => r.rkey)).toEqual([rkeys[2]]);
    expect(second.cursor).toBeUndefined();
  });

  it('deletes one record', async () => {
    const did = newDid();
    await store.put(did, 'pet.homeward.adopter.household', 'self', household);
    expect(await store.delete(did, 'pet.homeward.adopter.household', 'self')).toBe(true);
    expect(await store.get(did, 'pet.homeward.adopter.household', 'self')).toBeUndefined();
    expect(await store.delete(did, 'pet.homeward.adopter.household', 'self')).toBe(false);
  });

  it('exports and erases everything for a DID (GDPR)', async () => {
    const did = newDid();
    const other = newDid();
    await store.put(did, 'pet.homeward.adopter.household', 'self', household);
    await store.put(did, 'pet.homeward.adopter.location', 'self', {
      $type: 'pet.homeward.adopter.location',
      label: 'Utrecht',
      country: 'NL',
      latitude: '52.09',
      longitude: '5.12',
      updatedAt,
    });
    await store.put(other, 'pet.homeward.adopter.household', 'self', household);

    const exported = await store.exportAll(did);
    expect(exported.map((r) => r.collection)).toEqual([
      'pet.homeward.adopter.household',
      'pet.homeward.adopter.location',
    ]);
    expect(await store.deleteAll(did)).toBe(2);
    expect(await store.exportAll(did)).toEqual([]);
    expect(await store.get(other, 'pet.homeward.adopter.household', 'self')).toEqual(household);
  });

  it('re-encrypts rows onto a new active key, reporting rows it cannot read', async () => {
    const did = newDid();
    const corrupt = newDid();
    await store.put(did, 'pet.homeward.adopter.household', 'self', household);
    await store.put(corrupt, 'pet.homeward.adopter.household', 'self', household);
    await db.execute(sql`
      update private_records set ciphertext = '\\x00'::bytea || ciphertext where did = ${corrupt}`);

    const rotated = new PostgresPrivateStore(
      db,
      parseKeyring(`k1:${k1},k2:${generateKey()}`, 'k2'),
    );
    const failed: string[] = [];
    let cursor: RecordAddress | undefined;
    do {
      // A tiny batch size exercises the cursor across several calls.
      const result = await rotated.rotateKeys({ batchSize: 2, cursor });
      failed.push(...result.failed.map((f) => f.did));
      cursor = result.cursor;
    } while (cursor);

    const [row] = await db
      .select()
      .from(privateRecords)
      .where(sql`${privateRecords.did} = ${did}`);
    expect(row?.keyId).toBe('k2');
    expect(await rotated.get(did, 'pet.homeward.adopter.household', 'self')).toEqual(household);
    expect(failed).toContain(corrupt);
  });
});
