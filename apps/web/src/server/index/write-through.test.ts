import type { Client } from '@atproto/lex';
import { pet } from '@homeward/lexicons';
import { describe, expect, it, vi } from 'vitest';
import { withWriteThrough, type WriteThroughDeps } from './write-through';

const did = 'did:plc:hillfarm';
const createdAt = '2026-10-01T12:00:00.000Z';

function setup(options: { failIndex?: boolean } = {}) {
  const calls: string[] = [];
  const fail = () => (options.failIndex ? Promise.reject(new Error('db down')) : Promise.resolve());
  const store = {
    upsertOrg: vi.fn((_did: string, _record: unknown, _cid: string, handle?: string) => {
      calls.push(`org ${handle}`);
      return fail();
    }),
    upsertAnimal: vi.fn((uri: string) => (calls.push(`animal ${uri}`), fail())),
    upsertListing: vi.fn((uri: string) => (calls.push(`listing ${uri}`), fail())),
    deleteRecord: vi.fn((uri: string) => (calls.push(`delete ${uri}`), fail())),
  };
  const deps: WriteThroughDeps = { store, verifiedHandle: async () => 'hillfarm.example' };
  const fake = {
    did,
    async put(ns: { $nsid: string }, _input: unknown, options?: { rkey?: string }) {
      return { uri: `at://${did}/${ns.$nsid}/${options?.rkey ?? 'self'}`, cid: 'bafy-cid' };
    },
    async delete() {
      return {};
    },
    async get() {
      return { value: { name: 'from the PDS' } };
    },
  };
  return { calls, store, client: withWriteThrough(fake as unknown as Client, did, deps) };
}

describe('withWriteThrough', () => {
  it('indexes Homeward records it writes, with the verified handle', async () => {
    const { calls, client } = setup();
    await client.put(pet.homeward.org.profile, {
      displayName: 'Hill Farm',
      location: { locality: 'Utrecht', country: 'NL' },
      contact: { preferred: 'email', email: 'adopt@hillfarm.example' },
      createdAt,
    });
    await client.put(
      pet.homeward.animal,
      { name: 'Bonnie', species: 'rabbit', createdAt },
      { rkey: '3m5z2kq5qns2a' },
    );
    await client.put(
      pet.homeward.listing,
      {
        animals: [`at://${did}/pet.homeward.animal/3m5z2kq5qns2a`],
        status: 'available',
        createdAt,
      },
      { rkey: '3m5z2kq5qns2l' },
    );
    await client.delete(pet.homeward.listing, { rkey: '3m5z2kq5qns2l' });
    expect(calls).toEqual([
      'org hillfarm.example',
      `animal at://${did}/pet.homeward.animal/3m5z2kq5qns2a`,
      `listing at://${did}/pet.homeward.listing/3m5z2kq5qns2l`,
      `delete at://${did}/pet.homeward.listing/3m5z2kq5qns2l`,
    ]);
  });

  it('leaves other records and reads alone', async () => {
    const { calls, client } = setup();
    await client.put(pet.homeward.adopter.profile, { createdAt });
    expect(await client.get(pet.homeward.animal, { rkey: '3m5z2kq5qns2a' })).toEqual({
      value: { name: 'from the PDS' },
    });
    expect(calls).toEqual([]);
  });

  it('never fails the write when indexing fails', async () => {
    const { client, store } = setup({ failIndex: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      client.put(
        pet.homeward.animal,
        { name: 'Bonnie', species: 'rabbit', createdAt },
        { rkey: '3m5z2kq5qns2a' },
      ),
    ).resolves.toEqual({ uri: `at://${did}/pet.homeward.animal/3m5z2kq5qns2a`, cid: 'bafy-cid' });
    expect(store.upsertAnimal).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
