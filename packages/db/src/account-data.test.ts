import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { AccountDataStore } from './account-data';
import { generateKey, parseKeyring } from './crypto';
import { EmailConfirmationStore } from './email-confirmations';
import { createDb } from './index';
import { PrivateBlobStore } from './private-blobs';
import { PostgresPrivateStore } from './private-store';
import { orgReviewLog, orgReviews } from './schema';
import { SessionStore } from './session-store';
import { ShareLinkStore } from './share-links';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(databaseUrl)('AccountDataStore', () => {
  const db = createDb(databaseUrl);
  const keyring = parseKeyring(`k1:${generateKey()}`, 'k1');
  const clock = new Date('2026-10-24T10:00:00Z');
  const store = new AccountDataStore(db, keyring, () => clock);
  const records = new PostgresPrivateStore(db, keyring);
  const files = new PrivateBlobStore(db, keyring);
  const sessions = new SessionStore<{ secret: string }>(db, keyring, () => clock);
  const links = new ShareLinkStore(db, () => clock);
  const dids: string[] = [];
  const newDid = () => {
    const did = `did:plc:gdpr${randomBytes(6).toString('hex')}`;
    dids.push(did);
    return did;
  };

  afterAll(async () => {
    for (const did of dids) {
      await store.erase(did);
      await db.delete(orgReviewLog).where(eq(orgReviewLog.did, did));
      await db.delete(orgReviews).where(eq(orgReviews.did, did));
    }
    await db.close();
  });

  it("exports an adopter's answers, share links and sessions, never their secrets", async () => {
    const did = newDid();
    await records.put(did, 'pet.homeward.adopter.household', 'self', {
      $type: 'pet.homeward.adopter.household',
      homeType: 'flat',
      hoursAlone: 4,
      updatedAt: '2026-10-22T12:00:00.000Z',
    });
    const link = await links.create({
      adopterDid: did,
      adopterHandle: 'sam.example.org',
      orgDid: 'did:plc:hillfarm',
      listingUri: 'at://did:plc:hillfarm/pet.homeward.listing/3m5z2kq5qns2l',
      days: 30,
    });
    await links.recordView(link.id);
    await sessions.create({ did, handle: 'sam.example.org', data: { secret: 'refresh-token' } });

    const exported = await store.export(did);
    expect(exported).toMatchObject({
      exportedAt: clock.toISOString(),
      did,
      privateRecords: [
        {
          collection: 'pet.homeward.adopter.household',
          rkey: 'self',
          value: { homeType: 'flat', hoursAlone: 4 },
        },
      ],
      shareLinks: [{ orgDid: 'did:plc:hillfarm', state: 'active', views: 1 }],
      sessions: [{ createdAt: expect.any(String) }],
    });
    expect(exported.moderation).toBeUndefined();
    expect(exported.emailConfirmation).toBeUndefined();
    const text = JSON.stringify(exported);
    expect(text).not.toContain('refresh-token');
    expect(text).not.toContain(link.token);
  });

  it('exports an organisation’s drafts, files, email and moderation, without moderators', async () => {
    const did = newDid();
    await files.put(
      { did, record: 'pet.homeward.animal/3m5z2kq5qns2a', cid: 'bafkreiexample' },
      'image/jpeg',
      Buffer.from('photo'),
    );
    const confirmations = new EmailConfirmationStore(db, keyring, () => clock);
    const started = await confirmations.start(did, 'adopt@hillfarm.example');
    if (started.ok) await confirmations.confirm(did, 'adopt@hillfarm.example', started.code);
    await db.insert(orgReviews).values({
      did,
      state: 'rejected',
      reason: 'No charity number.',
      decidedBy: 'did:plc:moderator',
      decidedAt: clock,
    });
    await db.insert(orgReviewLog).values([
      { did, action: 'reject', reason: 'No charity number.', actorDid: 'did:plc:moderator' },
      { did, action: 'requestReview', actorDid: did },
    ]);

    const exported = await store.export(did);
    expect(exported.privateFiles).toEqual([
      {
        record: 'pet.homeward.animal/3m5z2kq5qns2a',
        cid: 'bafkreiexample',
        mimeType: 'image/jpeg',
        size: 5,
        createdAt: expect.any(String),
      },
    ]);
    expect(exported.emailConfirmation).toEqual({
      email: 'adopt@hillfarm.example',
      confirmedAt: clock.toISOString(),
    });
    expect(exported.moderation).toMatchObject({ state: 'rejected', reason: 'No charity number.' });
    expect(exported.moderation?.history.map((entry) => entry.byYou).sort()).toEqual([false, true]);
    expect(JSON.stringify(exported)).not.toContain('did:plc:moderator');
  });

  it('erases everything but moderation decisions, and can run again', async () => {
    const did = newDid();
    await records.put(did, 'pet.homeward.adopter.household', 'self', {
      $type: 'pet.homeward.adopter.household',
      homeType: 'house',
      updatedAt: '2026-10-22T12:00:00.000Z',
    });
    await files.put(
      { did, record: 'pet.homeward.animal/x', cid: 'c' },
      'image/jpeg',
      Buffer.from('p'),
    );
    await links.create({
      adopterDid: did,
      adopterHandle: 'sam.example.org',
      orgDid: 'did:plc:hillfarm',
      listingUri: 'at://did:plc:hillfarm/pet.homeward.listing/3m5z2kq5qns2l',
      days: 7,
    });
    const token = await sessions.create({ did, handle: 'sam.example.org', data: { secret: 's' } });
    await db.insert(orgReviews).values({ did, state: 'approved', decidedAt: clock });

    expect(await store.erase(did)).toEqual({
      privateRecords: 1,
      privateFiles: 1,
      shareLinks: 1,
      sessions: 1,
    });
    expect(await sessions.get(token)).toBeUndefined();
    const after = await store.export(did);
    expect(after).toMatchObject({
      privateRecords: [],
      privateFiles: [],
      shareLinks: [],
      sessions: [],
    });
    expect(after.moderation).toMatchObject({ state: 'approved' });
    expect(await store.erase(did)).toEqual({
      privateRecords: 0,
      privateFiles: 0,
      shareLinks: 0,
      sessions: 0,
    });
  });
});
