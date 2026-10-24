import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from './index';
import { shareLinks } from './schema';
import { ShareLinkStore } from './share-links';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(databaseUrl)('ShareLinkStore', () => {
  const db = createDb(databaseUrl);
  let clock = new Date('2026-10-24T10:00:00Z');
  const store = new ShareLinkStore(db, () => clock);
  const adopters: string[] = [];
  const link = (days = 30) => {
    const adopterDid = `did:plc:share${randomBytes(6).toString('hex')}`;
    adopters.push(adopterDid);
    return {
      adopterDid,
      adopterHandle: 'sam.example.org',
      orgDid: 'did:plc:hillfarm',
      listingUri: 'at://did:plc:hillfarm/pet.homeward.listing/3m5z2kq5qns2l',
      days,
    };
  };

  afterAll(async () => {
    for (const did of adopters) await store.deleteForAdopter(did);
    await db.close();
  });

  it('stores only a hash of the secret, and finds the link by it', async () => {
    const details = link();
    const { id, token, expiresAt } = await store.create(details);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt).toEqual(new Date('2026-11-23T10:00:00Z'));
    const [row] = await db.select().from(shareLinks).where(eq(shareLinks.id, id));
    expect(JSON.stringify(row)).not.toContain(token);
    const { days: _days, ...where } = details;
    expect(await store.find(token)).toMatchObject({ id, ...where, state: 'active' });
    expect(
      await store.find(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')),
    ).toBeUndefined();
    expect(await store.find('short')).toBeUndefined();
  });

  it('expires, offering only 7, 30 or 90 days', async () => {
    const week = await store.create(link(7));
    expect(week.expiresAt).toEqual(new Date('2026-10-31T10:00:00Z'));
    const odd = await store.create(link(365));
    expect(odd.expiresAt).toEqual(new Date('2026-11-23T10:00:00Z'));
    clock = new Date('2026-11-01T10:00:00Z');
    expect(await store.find(week.token)).toMatchObject({ state: 'expired' });
    expect(await store.find(odd.token)).toMatchObject({ state: 'active' });
    clock = new Date('2026-10-24T10:00:00Z');
  });

  it('counts views, and only the adopter can withdraw a link', async () => {
    const details = link();
    const { id, token } = await store.create(details);
    expect(await store.listForAdopter(details.adopterDid)).toMatchObject([{ id, views: 0 }]);

    clock = new Date('2026-10-25T09:00:00Z');
    await store.recordView(id);
    clock = new Date('2026-10-26T18:30:00Z');
    await store.recordView(id);
    const [listed] = await store.listForAdopter(details.adopterDid);
    expect(listed).toMatchObject({ views: 2, lastViewedAt: new Date('2026-10-26T18:30:00Z') });

    expect(await store.revoke('did:plc:someoneelse', id)).toBe(false);
    expect(await store.find(token)).toMatchObject({ state: 'active' });
    expect(await store.revoke(details.adopterDid, id)).toBe(true);
    expect(await store.find(token)).toMatchObject({ state: 'revoked' });
    expect(await store.revoke(details.adopterDid, id)).toBe(false);

    expect(await store.deleteForAdopter(details.adopterDid)).toBe(1);
    expect(await store.listForAdopter(details.adopterDid)).toEqual([]);
    clock = new Date('2026-10-24T10:00:00Z');
  });
});
