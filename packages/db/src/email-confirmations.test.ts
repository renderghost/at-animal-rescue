import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { generateKey, parseKeyring } from './crypto';
import {
  confirmationHolds,
  EmailConfirmationStore,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_HOUR,
} from './email-confirmations';
import { createDb } from './index';
import { emailConfirmations } from './schema';

const databaseUrl = process.env.DATABASE_URL;

describe('confirmationHolds', () => {
  const confirmedAt = new Date('2026-01-10T00:00:00Z');
  const confirmation = { email: 'adopt@hillfarm.org', confirmedAt };

  it('holds for the same address, ignoring case, for a year', () => {
    expect(confirmationHolds(confirmation, 'Adopt@HillFarm.org', new Date('2026-06-01'))).toBe(
      true,
    );
    expect(confirmationHolds(confirmation, 'adopt@hillfarm.org', new Date('2027-01-11'))).toBe(
      false,
    );
  });

  it('lapses when the contact email changes or is removed', () => {
    expect(confirmationHolds(confirmation, 'hello@hillfarm.org', new Date('2026-06-01'))).toBe(
      false,
    );
    expect(confirmationHolds(confirmation, undefined, new Date('2026-06-01'))).toBe(false);
    expect(confirmationHolds(undefined, 'adopt@hillfarm.org')).toBe(false);
  });
});

describe.runIf(databaseUrl)('EmailConfirmationStore', () => {
  const db = createDb(databaseUrl);
  const keyring = parseKeyring(`k1:${generateKey()}`, 'k1');
  let clock = new Date('2026-10-23T10:00:00Z');
  const store = new EmailConfirmationStore(db, keyring, () => clock);
  const dids: string[] = [];
  const email = 'adopt@hillfarm.org';

  afterAll(async () => {
    for (const did of dids) await store.delete(did);
    await db.close();
  });

  const newDid = () => {
    const did = `did:plc:mail${randomBytes(6).toString('hex')}`;
    dids.push(did);
    return did;
  };
  const advance = (minutes: number) => (clock = new Date(clock.getTime() + minutes * 60_000));
  const start = async (did: string, address = email) => {
    const result = await store.start(did, address);
    if (!result.ok) throw new Error('expected a code');
    return result.code;
  };
  const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

  it('confirms with the right code, once, and never stores the code', async () => {
    const did = newDid();
    const code = await start(did);
    expect(code).toMatch(/^\d{6}$/);
    expect(await store.pending(did, email)).toBe(true);
    const [row] = await db.select().from(emailConfirmations);
    expect(JSON.stringify(row)).not.toContain(code);

    expect(await store.confirm(did, email, wrong(code))).toBe('wrong');
    expect(await store.confirm(did, email, ` ${code.slice(0, 3)} ${code.slice(3)} `)).toBe(
      'confirmed',
    );
    expect(await store.get(did)).toEqual({ email, confirmedAt: clock });
    expect(await store.confirm(did, email, code)).toBe('noCode');
    expect(await store.pending(did, email)).toBe(false);
  });

  it('only accepts a code for the address it was sent to', async () => {
    const did = newDid();
    const code = await start(did);
    expect(await store.confirm(did, 'other@hillfarm.org', code)).toBe('noCode');
    expect(await store.confirm(did, 'ADOPT@hillfarm.org', code)).toBe('confirmed');
  });

  it('expires codes after 15 minutes', async () => {
    const did = newDid();
    const code = await start(did);
    advance(16);
    expect(await store.confirm(did, email, code)).toBe('expired');
    expect(await store.pending(did, email)).toBe(false);
  });

  it('cancels a code after too many wrong tries', async () => {
    const did = newDid();
    const code = await start(did);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      expect(await store.confirm(did, email, wrong(code))).toBe('wrong');
    }
    expect(await store.confirm(did, email, wrong(code))).toBe('tooManyAttempts');
    expect(await store.confirm(did, email, code)).toBe('tooManyAttempts');
  });

  it('limits sends per hour, and a new code replaces the old one', async () => {
    const did = newDid();
    const first = await start(did);
    for (let i = 1; i < MAX_SENDS_PER_HOUR; i++) await start(did);
    const blocked = await store.start(did, email);
    expect(blocked).toEqual({ ok: false, retryAfter: new Date(clock.getTime() + 60 * 60_000) });
    advance(61);
    const latest = await start(did);
    if (latest !== first) expect(await store.confirm(did, email, first)).toBe('wrong');
    expect(await store.confirm(did, email, latest)).toBe('confirmed');
  });
});
