import { randomBytes } from 'node:crypto';
import { pet } from '@homeward/lexicons';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from './index';
import { IndexStore, parseCoordinates } from './index-store';
import { indexListings, indexOrgs } from './schema';
import { findOrg, hiddenListingKeys } from './orgs';
import { getListing, listingDistanceKm, searchListings } from './search';

const databaseUrl = process.env.DATABASE_URL;
const createdAt = '2026-10-01T12:00:00.000Z';

// Utrecht and Amsterdam are about 35 km apart; Berlin about 580 km from Utrecht.
const UTRECHT = { latitude: '52.09', longitude: '5.12' };
const AMSTERDAM = { latitude: '52.37', longitude: '4.90' };

function orgRecord(place: { latitude?: string; longitude?: string } = UTRECHT) {
  return pet.homeward.org.profile.$parse({
    $type: 'pet.homeward.org.profile',
    displayName: 'Test Rescue',
    location: { locality: 'Utrecht', country: 'NL', ...place },
    contact: { preferred: 'email', email: 'adopt@test.example' },
    createdAt,
  });
}

function animalRecord(fields: Record<string, unknown>) {
  return pet.homeward.animal.$parse({
    $type: 'pet.homeward.animal',
    name: 'Bonnie',
    species: 'rabbit',
    createdAt,
    ...fields,
  });
}

function listingRecord(animals: string[], fields: Record<string, unknown> = {}) {
  return pet.homeward.listing.$parse({
    $type: 'pet.homeward.listing',
    animals,
    status: 'available',
    createdAt,
    ...fields,
  });
}

describe('parseCoordinates', () => {
  it('parses valid coordinates and drops bad ones', () => {
    const place = { locality: 'x', country: 'NL' };
    expect(parseCoordinates({ ...place, ...UTRECHT })).toEqual({
      latitude: 52.09,
      longitude: 5.12,
    });
    expect(parseCoordinates({ ...place, latitude: '91', longitude: '5' })).toBeUndefined();
    expect(parseCoordinates({ ...place, latitude: 'north', longitude: '5' })).toBeUndefined();
    expect(parseCoordinates(place)).toBeUndefined();
  });
});

describe.runIf(databaseUrl)('IndexStore and searchListings', () => {
  const db = createDb(databaseUrl);
  const store = new IndexStore(db);
  const dids: string[] = [];

  afterAll(async () => {
    for (const did of dids) await store.deleteRepo(did);
    await db.close();
  });

  /** A fresh organisation with animals, optionally trusted so listings skip review. */
  async function seedOrg({
    trusted = true,
    place = UTRECHT as { latitude?: string; longitude?: string },
  } = {}) {
    const did = `did:plc:idx${randomBytes(8).toString('hex')}`;
    dids.push(did);
    await store.upsertOrg(did, orgRecord(place), 'cid-org', 'test.example.org');
    if (trusted) await db.update(indexOrgs).set({ trusted: true }).where(eq(indexOrgs.did, did));
    const animal = (rkey: string) => `at://${did}/pet.homeward.animal/${rkey}`;
    const listing = (rkey: string) => `at://${did}/pet.homeward.listing/${rkey}`;
    return { did, animal, listing };
  }

  const uris = (page: Awaited<ReturnType<typeof searchListings>>) =>
    page.listings.map((l) => l.uri);

  it('keeps listings private until the organisation is approved, and again if revoked', async () => {
    const org = await seedOrg({ trusted: false });
    await store.upsertAnimal(org.animal('a1'), animalRecord({}), 'c');
    await store.upsertListing(org.listing('l1'), listingRecord([org.animal('a1')]), 'c');
    await store.upsertListing(org.listing('l2'), listingRecord([org.animal('a1')]), 'c');

    expect(uris(await searchListings(db, { orgDid: org.did }))).toEqual([]);
    const own = await searchListings(db, { orgDid: org.did, includeUnmoderated: true });
    expect(own.listings).toHaveLength(2);
    expect(own.listings[0]).toMatchObject({ orgApproved: false, moderation: 'visible' });

    // Approving the organisation releases every listing at once.
    await db.update(indexOrgs).set({ trusted: true }).where(eq(indexOrgs.did, org.did));
    expect(await searchListings(db, { orgDid: org.did })).toMatchObject({
      listings: [{ orgApproved: true }, { orgApproved: true }],
    });

    await db.update(indexOrgs).set({ trusted: false }).where(eq(indexOrgs.did, org.did));
    expect(uris(await searchListings(db, { orgDid: org.did }))).toEqual([]);
  });

  it('keeps a listing hidden after a report, even when it is edited', async () => {
    const org = await seedOrg();
    await store.upsertAnimal(org.animal('a1'), animalRecord({}), 'c');
    await store.upsertListing(org.listing('l1'), listingRecord([org.animal('a1')]), 'c');
    await db
      .update(indexListings)
      .set({ moderation: 'hidden' })
      .where(eq(indexListings.uri, org.listing('l1')));
    await store.upsertListing(
      org.listing('l1'),
      listingRecord([org.animal('a1')], { title: 'Edited' }),
      'c2',
    );
    expect(uris(await searchListings(db, { orgDid: org.did }))).toEqual([]);
    const own = await searchListings(db, { orgDid: org.did, includeUnmoderated: true });
    expect(own.listings[0]).toMatchObject({ moderation: 'hidden' });
    // The organisation's dashboard shows which.
    expect(await hiddenListingKeys(db, org.did)).toEqual(['l1']);
    // The listing page still finds it, and decides who may see it.
    expect(await getListing(db, org.listing('l1'))).toMatchObject({
      uri: org.listing('l1'),
      moderation: 'hidden',
      record: { title: 'Edited' },
      animals: [{ uri: org.animal('a1'), name: 'Bonnie' }],
    });
    expect(await getListing(db, org.listing('nope'))).toBeUndefined();
  });

  it('measures one listing’s distance, as search does', async () => {
    const org = await seedOrg();
    await store.upsertAnimal(org.animal('a1'), animalRecord({}), 'c');
    await store.upsertListing(org.listing('l1'), listingRecord([org.animal('a1')]), 'c');
    const amsterdam = { latitude: 52.37, longitude: 4.9 };
    const km = await listingDistanceKm(db, org.listing('l1'), amsterdam);
    const found = await searchListings(db, { orgDid: org.did, near: amsterdam });
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(40);
    expect(km).toBeCloseTo(found.listings[0]!.distanceKm!, 6);

    // Without a location, there's nothing to measure.
    const nowhere = await seedOrg({ place: {} });
    await store.upsertAnimal(nowhere.animal('a1'), animalRecord({}), 'c');
    await store.upsertListing(nowhere.listing('l1'), listingRecord([nowhere.animal('a1')]), 'c');
    expect(await listingDistanceKm(db, nowhere.listing('l1'), amsterdam)).toBeUndefined();
    expect(await listingDistanceKm(db, org.listing('nope'), amsterdam)).toBeUndefined();
  });

  it('filters by age group, worked out per species', async () => {
    const org = await seedOrg();
    const now = new Date('2026-10-23T00:00:00.000Z');
    // A 3-year-old rabbit is an adult (young under 1, senior from 5); a 3-year-old dog too
    // (young under 2, senior from 8); a 6-year-old rabbit is a senior.
    await store.upsertAnimal(
      org.animal('r3'),
      animalRecord({ birth: { date: '2023-10', estimated: true } }),
      'c',
    );
    await store.upsertAnimal(org.animal('r6'), animalRecord({ birth: { date: '2020' } }), 'c');
    await store.upsertAnimal(
      org.animal('d1'),
      animalRecord({ species: 'dog', birth: { date: '2025-12-01' } }),
      'c',
    );
    await store.upsertAnimal(org.animal('x'), animalRecord({}), 'c');
    for (const key of ['r3', 'r6', 'd1', 'x']) {
      await store.upsertListing(org.listing(key), listingRecord([org.animal(key)]), 'c');
    }
    const ages = async (ageGroups: Array<'young' | 'adult' | 'senior'>, species?: string[]) =>
      uris(await searchListings(db, { orgDid: org.did, ageGroups, species, now })).sort();

    expect(await ages(['adult'])).toEqual([org.listing('r3')]);
    expect(await ages(['senior'])).toEqual([org.listing('r6')]);
    expect(await ages(['young'])).toEqual([org.listing('d1')]);
    expect(await ages(['young', 'senior'], ['rabbit'])).toEqual([org.listing('r6')]);
  });

  it('filters by what listings state, never guessing', async () => {
    const org = await seedOrg();
    await store.upsertAnimal(org.animal('a'), animalRecord({}), 'c');
    const criterion = (type: string, fields: Record<string, unknown>) => ({
      $type: `pet.homeward.listing#${type}`,
      level: 'required',
      ...fields,
    });
    await store.upsertListing(
      org.listing('kids-cats-flat'),
      listingRecord([org.animal('a')], {
        criteria: [
          criterion('childrenCriterion', { allowed: true, minAge: 8 }),
          criterion('otherAnimalsCriterion', { animal: 'cat', allowed: true }),
          criterion('homeTypeCriterion', { allowed: ['flat', 'house'] }),
        ],
      }),
      'c',
    );
    await store.upsertListing(
      org.listing('adults-only'),
      listingRecord([org.animal('a')], {
        criteria: [
          criterion('childrenCriterion', { allowed: false }),
          criterion('experienceCriterion', { minimum: 'none' }),
        ],
      }),
      'c',
    );
    await store.upsertListing(org.listing('unstated'), listingRecord([org.animal('a')]), 'c');
    const stated = async (
      criteria: Array<'children' | 'cats' | 'dogs' | 'flat' | 'firstTimeOwners'>,
    ) => uris(await searchListings(db, { orgDid: org.did, criteria })).sort();

    expect(await stated(['children'])).toEqual([org.listing('kids-cats-flat')]);
    expect(await stated(['children', 'cats', 'flat'])).toEqual([org.listing('kids-cats-flat')]);
    expect(await stated(['dogs'])).toEqual([]);
    expect(await stated(['firstTimeOwners'])).toEqual([org.listing('adults-only')]);
  });

  it('finds an organisation by DID or verified handle, ignoring case', async () => {
    const org = await seedOrg({ trusted: false });
    expect(await findOrg(db, { did: org.did })).toMatchObject({
      did: org.did,
      handle: 'test.example.org',
      approved: false,
      record: { displayName: 'Test Rescue' },
    });
    // Every seeded organisation shares the handle; any of them proves the lookup.
    expect(await findOrg(db, { handle: 'TEST.example.org' })).toMatchObject({
      handle: 'test.example.org',
    });
    expect(await findOrg(db, { handle: 'nobody.example.org' })).toBeUndefined();
  });

  it('ignores animals from other repositories', async () => {
    const org = await seedOrg();
    const other = await seedOrg();
    await store.upsertAnimal(other.animal('x'), animalRecord({ name: 'Not yours' }), 'c');
    await store.upsertListing(org.listing('l1'), listingRecord([other.animal('x')]), 'c');
    // The only referenced animal belongs to someone else, so the listing has no animals.
    expect(uris(await searchListings(db, { orgDid: org.did }))).toEqual([]);
  });

  it('returns animals in listing order with organisation details', async () => {
    const org = await seedOrg();
    await store.upsertAnimal(org.animal('b'), animalRecord({ name: 'Clyde', sex: 'male' }), 'c');
    await store.upsertAnimal(org.animal('a'), animalRecord({ name: 'Bonnie', sex: 'female' }), 'c');
    await store.upsertListing(
      org.listing('l1'),
      listingRecord([org.animal('a'), org.animal('b')], {
        bonded: true,
        adoptionFee: { kind: 'donation', amount: { amount: 7500, currency: 'EUR' } },
      }),
      'c',
    );
    const [listing] = (await searchListings(db, { orgDid: org.did })).listings;
    expect(listing!.animals.map((a) => a.name)).toEqual(['Bonnie', 'Clyde']);
    expect(listing).toMatchObject({
      bonded: true,
      fee: { kind: 'donation', amount: 7500, currency: 'EUR' },
      org: { displayName: 'Test Rescue', handle: 'test.example.org', country: 'NL' },
    });
  });

  it('filters by species, size, sex, bonded and status', async () => {
    const org = await seedOrg();
    await store.upsertAnimal(
      org.animal('dog'),
      animalRecord({ species: 'dog', size: 'large', sex: 'male' }),
      'c',
    );
    await store.upsertAnimal(
      org.animal('cat'),
      animalRecord({ species: 'cat', size: 'small', sex: 'female' }),
      'c',
    );
    await store.upsertListing(org.listing('dog'), listingRecord([org.animal('dog')]), 'c');
    await store.upsertListing(
      org.listing('cat'),
      listingRecord([org.animal('cat')], { bonded: true }),
      'c',
    );
    await store.upsertListing(
      org.listing('adopted'),
      listingRecord([org.animal('cat')], { status: 'adopted' }),
      'c',
    );
    const find = (search: Parameters<typeof searchListings>[1]) =>
      searchListings(db, { orgDid: org.did, ...search }).then((p) => uris(p).sort());

    expect(await find({ species: ['dog'] })).toEqual([org.listing('dog')]);
    expect(await find({ sizes: ['small'] })).toEqual([org.listing('cat')]);
    expect(await find({ sexes: ['male', 'female'] })).toEqual(
      [org.listing('cat'), org.listing('dog')].sort(),
    );
    expect(await find({ bonded: true })).toEqual([org.listing('cat')]);
    expect(await find({})).not.toContain(org.listing('adopted'));
    expect(await find({ statuses: ['adopted'] })).toEqual([org.listing('adopted')]);
  });

  it('searches by distance and sorts nearest first', async () => {
    const utrecht = await seedOrg({ place: UTRECHT });
    await store.upsertAnimal(utrecht.animal('a'), animalRecord({}), 'c');
    await store.upsertListing(utrecht.listing('here'), listingRecord([utrecht.animal('a')]), 'c');
    await store.upsertListing(
      utrecht.listing('foster'),
      listingRecord([utrecht.animal('a')], {
        location: { locality: 'Amsterdam', country: 'NL', ...AMSTERDAM },
      }),
      'c',
    );
    const near = { latitude: 52.09, longitude: 5.12 };

    const nearest = await searchListings(db, { orgDid: utrecht.did, near, sort: 'nearest' });
    expect(uris(nearest)).toEqual([utrecht.listing('here'), utrecht.listing('foster')]);
    expect(nearest.listings[1]!.distanceKm).toBeGreaterThan(30);
    expect(nearest.listings[1]!.distanceKm).toBeLessThan(40);

    const within10 = await searchListings(db, {
      orgDid: utrecht.did,
      near: { ...near, maxKm: 10 },
    });
    expect(uris(within10)).toEqual([utrecht.listing('here')]);
  });

  it('moves listings with their organisation unless they have their own location', async () => {
    const org = await seedOrg({ place: UTRECHT });
    await store.upsertAnimal(org.animal('a'), animalRecord({}), 'c');
    await store.upsertListing(org.listing('follows'), listingRecord([org.animal('a')]), 'c');
    await store.upsertListing(
      org.listing('foster'),
      listingRecord([org.animal('a')], {
        location: { locality: 'Utrecht', country: 'NL', ...UTRECHT },
      }),
      'c',
    );
    await store.upsertOrg(org.did, orgRecord(AMSTERDAM), 'cid-org-2');
    const nearAmsterdam = await searchListings(db, {
      orgDid: org.did,
      near: { latitude: 52.37, longitude: 4.9, maxKm: 5 },
    });
    expect(uris(nearAmsterdam)).toEqual([org.listing('follows')]);
  });

  it('pages through results with a cursor', async () => {
    const org = await seedOrg();
    await store.upsertAnimal(org.animal('a'), animalRecord({}), 'c');
    for (let i = 1; i <= 5; i++) {
      await store.upsertListing(
        org.listing(`l${i}`),
        listingRecord([org.animal('a')], { createdAt: `2026-10-0${i}T12:00:00.000Z` }),
        'c',
      );
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await searchListings(db, { orgDid: org.did, limit: 2, cursor });
      seen.push(...uris(page));
      cursor = page.cursor;
    } while (cursor);
    expect(seen).toEqual([5, 4, 3, 2, 1].map((i) => org.listing(`l${i}`)));

    const nearestSeen: string[] = [];
    cursor = undefined;
    do {
      const page = await searchListings(db, {
        orgDid: org.did,
        near: { latitude: 52.09, longitude: 5.12 },
        sort: 'nearest',
        limit: 2,
        cursor,
      });
      nearestSeen.push(...uris(page));
      cursor = page.cursor;
    } while (cursor);
    expect(nearestSeen.sort()).toEqual(seen.sort());
  });

  it('excludes listings whose repository has no organisation profile', async () => {
    const org = await seedOrg();
    await store.upsertAnimal(org.animal('a'), animalRecord({}), 'c');
    await store.upsertListing(org.listing('l1'), listingRecord([org.animal('a')]), 'c');
    await store.deleteRecord(`at://${org.did}/pet.homeward.org.profile/self`);
    expect(uris(await searchListings(db, { orgDid: org.did }))).toEqual([]);
  });

  it('deletes single records and whole repositories', async () => {
    const org = await seedOrg();
    await store.upsertAnimal(org.animal('a'), animalRecord({}), 'c');
    await store.upsertListing(org.listing('l1'), listingRecord([org.animal('a')]), 'c');
    await store.upsertListing(org.listing('l2'), listingRecord([org.animal('a')]), 'c');
    await store.deleteRecord(org.listing('l1'));
    expect(uris(await searchListings(db, { orgDid: org.did }))).toEqual([org.listing('l2')]);
    await store.deleteRepo(org.did);
    expect(await db.select().from(indexListings).where(eq(indexListings.did, org.did))).toEqual([]);
  });
});
