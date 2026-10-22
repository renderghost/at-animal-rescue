import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { generateKey, parseKeyring } from './crypto';
import { createDb } from './index';
import { sessions } from './schema';
import { SESSION_IDLE_SECONDS, SESSION_MAX_AGE_SECONDS, SessionStore } from './session-store';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(databaseUrl)('SessionStore', () => {
  const db = createDb(databaseUrl);
  const keyring = parseKeyring(`k1:${generateKey()}`, 'k1');
  let clock = new Date('2026-10-22T12:00:00Z');
  const store = new SessionStore<{ accessJwt: string; refreshJwt: string }>(
    db,
    keyring,
    () => clock,
  );
  const dids: string[] = [];
  const newDid = () => {
    const did = `did:plc:sess${randomBytes(8).toString('hex')}`;
    dids.push(did);
    return did;
  };
  const data = { accessJwt: 'access-secret', refreshJwt: 'refresh-secret' };
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');

  afterAll(async () => {
    for (const did of dids) await store.deleteAllForDid(did);
    await db.close();
  });

  it('creates and reads a session', async () => {
    const did = newDid();
    const token = await store.create({ did, handle: 'rescue.example.org', data });
    expect(await store.get(token)).toEqual({ did, handle: 'rescue.example.org', data });
  });

  it('stores only a hash of the token and encrypts the PDS tokens', async () => {
    const did = newDid();
    const token = await store.create({ did, handle: 'h.example.org', data });
    const [row] = await db.select().from(sessions).where(eq(sessions.did, did));
    expect(row!.tokenHash).toBe(hash(token));
    expect(row!.tokenHash).not.toBe(token);
    expect(row!.ciphertext.toString('utf8')).not.toContain('refresh-secret');
  });

  it('rejects unknown tokens', async () => {
    expect(await store.get('not-a-real-token')).toBeUndefined();
  });

  it('expires after the absolute lifetime, even when active', async () => {
    const did = newDid();
    clock = new Date('2026-10-22T12:00:00Z');
    const token = await store.create({ did, handle: 'h.example.org', data });
    for (let day = 1; day <= 29; day += 7) {
      clock = new Date(Date.parse('2026-10-22T12:00:00Z') + day * 86_400_000);
      expect(await store.get(token)).toBeDefined();
    }
    clock = new Date(Date.parse('2026-10-22T12:00:00Z') + SESSION_MAX_AGE_SECONDS * 1000 + 1000);
    expect(await store.get(token)).toBeUndefined();
  });

  it('expires after the idle timeout', async () => {
    const did = newDid();
    clock = new Date('2026-10-22T12:00:00Z');
    const token = await store.create({ did, handle: 'h.example.org', data });
    clock = new Date(Date.parse('2026-10-22T12:00:00Z') + SESSION_IDLE_SECONDS * 1000 + 1000);
    expect(await store.get(token)).toBeUndefined();
  });

  it('updates the secret data after a token refresh', async () => {
    const did = newDid();
    clock = new Date('2026-10-22T12:00:00Z');
    const token = await store.create({ did, handle: 'h.example.org', data });
    await store.update(token, { accessJwt: 'new-access', refreshJwt: 'new-refresh' });
    expect((await store.get(token))?.data.refreshJwt).toBe('new-refresh');
  });

  it('deletes one session, or all of an account’s sessions', async () => {
    const did = newDid();
    clock = new Date('2026-10-22T12:00:00Z');
    const a = await store.create({ did, handle: 'h.example.org', data });
    const b = await store.create({ did, handle: 'h.example.org', data });
    await store.delete(a);
    expect(await store.get(a)).toBeUndefined();
    expect(await store.get(b)).toBeDefined();
    expect(await store.deleteAllForDid(did)).toBe(1);
    expect(await store.get(b)).toBeUndefined();
  });

  it('treats a session it can no longer decrypt as signed out', async () => {
    const did = newDid();
    clock = new Date('2026-10-22T12:00:00Z');
    const token = await store.create({ did, handle: 'h.example.org', data });
    const otherKeys = new SessionStore(db, parseKeyring(`k9:${generateKey()}`, 'k9'), () => clock);
    expect(await otherKeys.get(token)).toBeUndefined();
    expect(await store.get(token)).toBeUndefined();
  });

  it('purges expired and idle sessions', async () => {
    const did = newDid();
    clock = new Date('2026-10-22T12:00:00Z');
    await store.create({ did, handle: 'h.example.org', data });
    clock = new Date(Date.parse('2026-10-22T12:00:00Z') + SESSION_IDLE_SECONDS * 1000 + 1000);
    expect(await store.purgeExpired()).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(sessions).where(eq(sessions.did, did))).toEqual([]);
  });
});
