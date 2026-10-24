import { randomBytes } from 'node:crypto';
import { pet } from '@homeward/lexicons';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from './index';
import { IndexStore } from './index-store';
import { ListingReportStore } from './listing-reports';
import { getListing } from './search';
import { listingHides, listingModerationLog, listingReports } from './schema';

const databaseUrl = process.env.DATABASE_URL;
const MODERATOR = 'did:plc:moderator';
const createdAt = '2026-10-01T12:00:00.000Z';

const profile = pet.homeward.org.profile.$parse({
  $type: 'pet.homeward.org.profile',
  displayName: 'Hill Farm Rescue',
  location: { locality: 'Utrecht', country: 'NL' },
  contact: { preferred: 'email', email: 'adopt@hillfarm.example' },
  createdAt,
});

describe.runIf(databaseUrl)('ListingReportStore', () => {
  const db = createDb(databaseUrl);
  let clock = new Date('2026-10-24T10:00:00Z');
  const store = new ListingReportStore(db, () => clock);
  const index = new IndexStore(db);
  const dids: string[] = [];
  const uris: string[] = [];

  async function newListing() {
    const did = `did:plc:report${randomBytes(6).toString('hex')}`;
    dids.push(did);
    await index.upsertOrg(did, profile, 'cid', `${did.slice(8)}.example.org`);
    const animal = `at://${did}/pet.homeward.animal/3l2aaaaaaaaaa`;
    await index.upsertAnimal(
      animal,
      pet.homeward.animal.$parse({
        $type: 'pet.homeward.animal',
        name: 'Bonnie',
        species: 'rabbit',
        createdAt,
      }),
      'cid',
    );
    const uri = `at://${did}/pet.homeward.listing/3l2bbbbbbbbbb`;
    uris.push(uri);
    await indexListing(uri, animal);
    return { did, uri, animal };
  }

  async function indexListing(uri: string, animal: string) {
    await index.upsertListing(
      uri,
      pet.homeward.listing.$parse({
        $type: 'pet.homeward.listing',
        animals: [animal],
        status: 'available',
        createdAt,
      }),
      'cid',
    );
  }

  const report = (listingUri: string, orgDid: string, extra: object = {}) =>
    store.report({
      listingUri,
      orgDid,
      reason: 'welfare',
      explanation: 'The photos show a rabbit in a tiny cage.',
      ...extra,
    });

  const hide = (listingUri: string, orgDid: string) =>
    store.hide({
      listingUri,
      orgDid,
      category: 'STATEMENT_CATEGORY_ANIMAL_WELFARE',
      ground: 'terms',
      statement: 'The photos show the rabbit kept in a cage far too small for it.',
      actorDid: MODERATOR,
    });

  afterAll(async () => {
    for (const uri of uris) {
      await db.delete(listingModerationLog).where(eq(listingModerationLog.listingUri, uri));
      await db.delete(listingReports).where(eq(listingReports.listingUri, uri));
      await db.delete(listingHides).where(eq(listingHides.listingUri, uri));
    }
    for (const did of dids) await index.deleteRepo(did);
    await db.close();
  });

  it('takes a report with a reference and queues it', async () => {
    const { did, uri } = await newListing();
    const taken = await report(uri, did, { reporterEmail: 'sam@example.org' });
    expect(taken.reference).toMatch(/^R-[A-HJKMNP-Z2-9]{6}$/);
    expect(taken).toMatchObject({ state: 'open', reporterEmail: 'sam@example.org' });
    expect(taken.reporterName).toBeUndefined();
    expect((await store.open()).map((r) => r.id)).toContain(taken.id);
    expect(await store.history(uri)).toEqual([
      expect.objectContaining({ action: 'reported', reportId: taken.id, note: 'welfare' }),
    ]);
  });

  it('counts recent reports from one email address', async () => {
    const { did, uri } = await newListing();
    const email = `flood-${randomBytes(4).toString('hex')}@example.org`;
    clock = new Date('2026-10-24T09:00:00Z');
    await report(uri, did, { reporterEmail: email });
    clock = new Date('2026-10-24T10:30:00Z');
    await report(uri, did, { reporterEmail: email.toUpperCase() });
    await report(uri, did, { reporterEmail: email });
    expect(await store.countFromEmail(email, new Date('2026-10-24T10:00:00Z'))).toBe(2);
  });

  it('hides a listing, deciding every open report about it', async () => {
    const { did, uri, animal } = await newListing();
    const first = await report(uri, did);
    const second = await report(uri, did, { reason: 'illegalSale' });

    clock = new Date('2026-10-24T11:00:00Z');
    const decided = await hide(uri, did);
    expect(decided.map((r) => r.id).sort()).toEqual([first.id, second.id].sort());
    expect(decided[0]).toMatchObject({ state: 'actioned', decidedAt: clock });
    expect((await store.open()).map((r) => r.id)).not.toContain(first.id);
    expect(await getListing(db, uri)).toMatchObject({ moderation: 'hidden' });
    expect((await store.hidesOf(did)).map((h) => h.listingUri)).toEqual([uri]);

    // An edit, or a rebuilt index, keeps it hidden.
    await indexListing(uri, animal);
    expect(await getListing(db, uri)).toMatchObject({ moderation: 'hidden' });
    await index.deleteRecord(uri);
    await indexListing(uri, animal);
    expect(await getListing(db, uri)).toMatchObject({ moderation: 'hidden' });
  });

  it('dismisses one report with a reason, once', async () => {
    const { did, uri } = await newListing();
    const taken = await report(uri, did);
    const dismissed = await store.dismiss(taken.id, MODERATOR, 'The cage meets the guidance.');
    expect(dismissed).toMatchObject({
      state: 'dismissed',
      decisionNote: 'The cage meets the guidance.',
    });
    expect(await store.dismiss(taken.id, MODERATOR, 'again')).toBeUndefined();
    expect(await getListing(db, uri)).toMatchObject({ moderation: 'visible' });
    expect((await store.history(uri)).map((e) => e.action)).toEqual(['dismissed', 'reported']);
  });

  it('lets the organisation ask for one second look, which can reinstate', async () => {
    const { did, uri } = await newListing();
    await report(uri, did);
    await hide(uri, did);

    expect(await store.appeal(uri, 'did:plc:someoneelse', 'Not ours')).toBe(false);
    expect(await store.appeal(uri, did, 'The cage is a run; here is a wider photo.')).toBe(true);
    expect(await store.appeal(uri, did, 'Again')).toBe(false);
    expect((await store.openAppeals()).map((h) => h.listingUri)).toContain(uri);

    expect(await store.reinstate(uri, MODERATOR, 'The run is big enough.')).toBe(true);
    expect(await store.hideOf(uri)).toBeUndefined();
    expect(await getListing(db, uri)).toMatchObject({ moderation: 'visible' });
    expect((await store.openAppeals()).map((h) => h.listingUri)).not.toContain(uri);
    expect((await store.history(uri)).map((e) => e.action)).toEqual([
      'reinstated',
      'appealed',
      'hidden',
      'reported',
    ]);
  });

  it('can uphold a second look, keeping the listing hidden', async () => {
    const { did, uri } = await newListing();
    await hide(uri, did);
    expect(await store.uphold(uri, MODERATOR, 'No appeal yet')).toBe(false);
    await store.appeal(uri, did, 'Please look again.');
    expect(await store.uphold(uri, MODERATOR, 'The photos still show a small cage.')).toBe(true);
    expect(await store.hideOf(uri)).toMatchObject({
      appealNote: 'The photos still show a small cage.',
      appealDecidedAt: clock,
    });
    expect((await store.openAppeals()).map((h) => h.listingUri)).not.toContain(uri);
    expect(await getListing(db, uri)).toMatchObject({ moderation: 'hidden' });
  });

  it("erases reporters' contact details six months after the decision", async () => {
    const { did, uri } = await newListing();
    clock = new Date('2026-01-10T10:00:00Z');
    const old = await report(uri, did, { reporterName: 'Sam', reporterEmail: 'sam@example.org' });
    await store.dismiss(old.id, MODERATOR, 'No problem found.');
    const undecided = await report(uri, did, { reporterEmail: 'kim@example.org' });

    clock = new Date('2026-07-09T10:00:00Z');
    await store.eraseExpiredContacts();
    expect(await store.get(old.id)).toMatchObject({ reporterEmail: 'sam@example.org' });

    clock = new Date('2026-07-11T10:00:00Z');
    expect(await store.eraseExpiredContacts()).toBeGreaterThanOrEqual(1);
    const erased = await store.get(old.id);
    expect(erased).toMatchObject({ reason: 'welfare', decisionNote: 'No problem found.' });
    expect(erased?.reporterName).toBeUndefined();
    expect(erased?.reporterEmail).toBeUndefined();
    expect(await store.get(undecided.id)).toMatchObject({ reporterEmail: 'kim@example.org' });
  });
});
