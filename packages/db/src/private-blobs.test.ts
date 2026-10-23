import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { generateKey, parseKeyring } from './crypto';
import { createDb } from './index';
import { PrivateBlobStore } from './private-blobs';
import { privateBlobs } from './schema';

const databaseUrl = process.env.DATABASE_URL;
const BONNIE = 'pet.homeward.animal/3m5z2kq5qns2a';
const REX = 'pet.homeward.animal/3m5z2kq5qns2b';

describe.runIf(databaseUrl)('PrivateBlobStore', () => {
  const db = createDb(databaseUrl);
  const k1 = generateKey();
  const k2 = generateKey();
  const store = new PrivateBlobStore(db, parseKeyring(`k1:${k1}`, 'k1'));
  const dids: string[] = [];
  const newDid = () => {
    const did = `did:plc:blob${randomBytes(6).toString('hex')}`;
    dids.push(did);
    return did;
  };

  afterAll(async () => {
    for (const did of dids) await store.deleteAll(did);
    await db.close();
  });

  it('stores files encrypted and returns them to their owner', async () => {
    const did = newDid();
    const bytes = Buffer.from('a photo of Bonnie, pretend JPEG');
    await store.put({ did, record: BONNIE, cid: 'bafkreiexample' }, 'image/jpeg', bytes);
    expect(await store.get({ did, record: BONNIE, cid: 'bafkreiexample' })).toEqual({
      mimeType: 'image/jpeg',
      bytes,
    });
    expect(await store.get({ did: newDid(), record: BONNIE, cid: 'bafkreiexample' })).toBe(
      undefined,
    );
    expect(await store.get({ did, record: REX, cid: 'bafkreiexample' })).toBeUndefined();
    const rows = await db.select().from(privateBlobs);
    expect(rows.some((row) => row.ciphertext.includes(bytes))).toBe(false);
  });

  it('keeps the same file separately for each draft', async () => {
    const did = newDid();
    const bytes = Buffer.from('the same photo');
    await store.put({ did, record: BONNIE, cid: 'same' }, 'image/jpeg', bytes);
    await store.put({ did, record: REX, cid: 'same' }, 'image/jpeg', bytes);
    await store.delete(did, BONNIE, ['same']);
    expect(await store.get({ did, record: BONNIE, cid: 'same' })).toBeUndefined();
    expect(await store.get({ did, record: REX, cid: 'same' })).toEqual({
      mimeType: 'image/jpeg',
      bytes,
    });
  });

  it("deletes chosen files, a draft's files, or everything for an account", async () => {
    const did = newDid();
    for (const cid of ['a', 'b', 'c']) {
      await store.put({ did, record: BONNIE, cid }, 'image/jpeg', Buffer.from(cid));
    }
    await store.put({ did, record: REX, cid: 'd' }, 'image/jpeg', Buffer.from('d'));
    await store.delete(did, BONNIE, ['a']);
    expect(await store.get({ did, record: BONNIE, cid: 'a' })).toBeUndefined();
    await store.delete(did, BONNIE);
    expect(await store.get({ did, record: BONNIE, cid: 'b' })).toBeUndefined();
    expect(await store.deleteAll(did)).toBe(1);
  });

  it('re-encrypts onto a new active key', async () => {
    const did = newDid();
    const address = { did, record: BONNIE, cid: 'cid1' };
    await store.put(address, 'image/png', Buffer.from('png'));
    const rotated = new PrivateBlobStore(db, parseKeyring(`k1:${k1},k2:${k2}`, 'k2'));
    let cursor;
    do {
      const result = await rotated.rotateKeys({ cursor });
      cursor = result.cursor;
    } while (cursor);
    const onlyNew = new PrivateBlobStore(db, parseKeyring(`k2:${k2}`, 'k2'));
    expect(await onlyNew.get(address)).toEqual({
      mimeType: 'image/png',
      bytes: Buffer.from('png'),
    });
  });
});
