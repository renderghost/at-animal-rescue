import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { generateKey, parseKeyring } from './crypto';
import { createDb } from './index';
import { signInFailures } from './schema';
import { SIGN_IN_WINDOW_MS, SignInFailureStore } from './sign-in-failures';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(databaseUrl)('SignInFailureStore', () => {
  const db = createDb(databaseUrl);
  let clock = new Date('2026-10-24T10:00:00Z');
  const store = new SignInFailureStore(db, parseKeyring(`k1:${generateKey()}`, 'k1'), () => clock);
  const did = () => `did:plc:signin${randomBytes(6).toString('hex')}`;
  const ip = () => `192.0.2.${Math.floor(Math.random() * 250)}-${randomBytes(3).toString('hex')}`;
  const minutes = (n: number) => new Date(clock.getTime() + n * 60_000);

  afterAll(async () => {
    await db.delete(signInFailures);
    await db.close();
  });

  it('blocks an account after 10 failures, until the oldest ages out', async () => {
    const account = did();
    const start = clock;
    for (let i = 0; i < 10; i++) {
      expect(await store.blockedUntil({ did: account })).toBeUndefined();
      await store.failed({ did: account });
      clock = new Date(clock.getTime() + 60_000);
    }
    expect(await store.blockedUntil({ did: account })).toEqual(
      new Date(start.getTime() + SIGN_IN_WINDOW_MS),
    );
    clock = new Date(start.getTime() + SIGN_IN_WINDOW_MS + 1);
    expect(await store.blockedUntil({ did: account })).toBeUndefined();
  });

  it('blocks an address after 30 failures across accounts', async () => {
    const address = ip();
    for (let i = 0; i < 29; i++) await store.failed({ did: did(), ip: address });
    expect(await store.blockedUntil({ ip: address })).toBeUndefined();
    await store.failed({ ip: address });
    expect(await store.blockedUntil({ ip: address })).toEqual(minutes(15));
    expect(await store.blockedUntil({ ip: ip() })).toBeUndefined();
  });

  it('clears an account after a successful sign-in', async () => {
    const account = did();
    for (let i = 0; i < 10; i++) await store.failed({ did: account });
    expect(await store.blockedUntil({ did: account })).toBeDefined();
    await store.succeeded(account);
    expect(await store.blockedUntil({ did: account })).toBeUndefined();
  });

  it('keeps only keyed hashes, and nothing past the window', async () => {
    const account = did();
    await store.failed({ did: account, ip: '203.0.113.7' });
    const rows = await db.select().from(signInFailures);
    expect(JSON.stringify(rows)).not.toContain(account);
    expect(JSON.stringify(rows)).not.toContain('203.0.113.7');
    clock = new Date(clock.getTime() + SIGN_IN_WINDOW_MS + 60_000);
    await store.failed({ did: did() });
    const left = await db.select().from(signInFailures);
    expect(left.every((row) => row.at.getTime() > clock.getTime() - SIGN_IN_WINDOW_MS)).toBe(true);
  });
});
