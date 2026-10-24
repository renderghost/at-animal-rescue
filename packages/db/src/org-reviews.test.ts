import { randomBytes } from 'node:crypto';
import { pet } from '@homeward/lexicons';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from './index';
import { IndexStore } from './index-store';
import { OrgReviewStore } from './org-reviews';
import { findOrg } from './orgs';
import { indexOrgs, orgReviewLog, orgReviews } from './schema';

const databaseUrl = process.env.DATABASE_URL;
const MODERATOR = 'did:plc:moderator';

const profile = pet.homeward.org.profile.$parse({
  $type: 'pet.homeward.org.profile',
  displayName: 'Hill Farm Rescue',
  location: { locality: 'Utrecht', country: 'NL' },
  contact: { preferred: 'email', email: 'adopt@hillfarm.example' },
  createdAt: '2026-10-01T00:00:00.000Z',
});

describe.runIf(databaseUrl)('OrgReviewStore', () => {
  const db = createDb(databaseUrl);
  let clock = new Date('2026-10-24T10:00:00Z');
  const store = new OrgReviewStore(db, () => clock);
  const index = new IndexStore(db);
  const dids: string[] = [];

  async function newOrg() {
    const did = `did:plc:review${randomBytes(6).toString('hex')}`;
    dids.push(did);
    await index.upsertOrg(did, profile, 'cid', `${did.slice(8)}.example.org`);
    return did;
  }

  afterAll(async () => {
    for (const did of dids) {
      await db.delete(orgReviewLog).where(eq(orgReviewLog.did, did));
      await db.delete(orgReviews).where(eq(orgReviews.did, did));
      await index.deleteRepo(did);
    }
    await db.close();
  });

  it('waits for a first review, then approval makes it public', async () => {
    const did = await newOrg();
    expect(await store.get(did)).toEqual({ state: 'pending' });
    expect((await store.list()).pending.map((org) => org.did)).toContain(did);

    await store.approve(did, MODERATOR);
    expect(await store.get(did)).toMatchObject({ state: 'approved' });
    expect(await findOrg(db, { did })).toMatchObject({ approved: true });
    const { approved, pending } = await store.list();
    expect(approved.find((org) => org.did === did)).toMatchObject({
      displayName: 'Hill Farm Rescue',
      createdAt: '2026-10-01T00:00:00.000Z',
      listings: 0,
    });
    expect(pending.map((org) => org.did)).not.toContain(did);
  });

  it('rejects with a reason, then the organisation can ask again', async () => {
    const did = await newOrg();
    expect(await store.requestReview(did)).toBe(false); // nothing to ask yet
    await store.reject(did, MODERATOR, 'We couldn’t find your charity registration.');
    expect(await store.get(did)).toEqual({
      state: 'rejected',
      reason: 'We couldn’t find your charity registration.',
      decidedAt: clock,
    });
    expect((await store.list()).notApproved.map((org) => org.did)).toContain(did);

    clock = new Date('2026-10-25T09:00:00Z');
    expect(await store.requestReview(did)).toBe(true);
    expect(await store.get(did)).toMatchObject({ state: 'pending', requestedAt: clock });
    expect((await store.list()).pending.map((org) => org.did)).toContain(did);
    clock = new Date('2026-10-24T10:00:00Z');
  });

  it('revokes approval, hiding everything again, and logs every step', async () => {
    const did = await newOrg();
    await store.approve(did, MODERATOR);
    clock = new Date('2026-10-24T11:00:00Z');
    await store.revoke(did, 'did:plc:second', 'Listings offered animals for sale.');
    expect(await findOrg(db, { did })).toMatchObject({ approved: false });
    expect(await store.get(did)).toMatchObject({
      state: 'revoked',
      reason: 'Listings offered animals for sale.',
    });
    expect(await store.history(did)).toEqual([
      {
        action: 'revoke',
        reason: 'Listings offered animals for sale.',
        actorDid: 'did:plc:second',
        at: new Date('2026-10-24T11:00:00Z'),
      },
      { action: 'approve', actorDid: MODERATOR, at: new Date('2026-10-24T10:00:00Z') },
    ]);
    clock = new Date('2026-10-24T10:00:00Z');
  });

  it('keeps approval when the index is rebuilt', async () => {
    const did = await newOrg();
    await store.approve(did, MODERATOR);
    await index.deleteRepo(did);
    await index.upsertOrg(did, profile, 'cid2');
    expect(await findOrg(db, { did })).toMatchObject({ approved: true });
    // An organisation never reviewed stays private.
    const fresh = await newOrg();
    const [row] = await db.select().from(indexOrgs).where(eq(indexOrgs.did, fresh));
    expect(row?.trusted).toBe(false);
  });
});
