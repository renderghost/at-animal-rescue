import { randomBytes } from 'node:crypto';
import { pet } from '@homeward/lexicons';
import { jsonToLex } from '@atproto/lex';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from './index';
import { IndexStore } from './index-store';
import { isPublicPhoto } from './photos';
import { indexListings, indexOrgs } from './schema';

const databaseUrl = process.env.DATABASE_URL;
const createdAt = '2026-10-01T12:00:00.000Z';
const PHOTO = 'bafkreihr7jqqzvtzzhydfwijovqpyqejbjrotivnd3dhafrack6httkoaq';
const OTHER = 'bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yegnrjhc4yeq';

describe.runIf(databaseUrl)('isPublicPhoto', () => {
  const db = createDb(databaseUrl);
  const store = new IndexStore(db);
  const dids: string[] = [];

  afterAll(async () => {
    for (const did of dids) await store.deleteRepo(did);
    await db.close();
  });

  async function seed(status = 'available') {
    const did = `did:plc:img${randomBytes(8).toString('hex')}`;
    dids.push(did);
    await store.upsertOrg(
      did,
      pet.homeward.org.profile.$parse({
        $type: 'pet.homeward.org.profile',
        displayName: 'Hill Farm',
        location: { locality: 'Utrecht', country: 'NL' },
        contact: { preferred: 'email', email: 'adopt@test.example' },
        createdAt,
      }),
      'c',
    );
    await db.update(indexOrgs).set({ trusted: true }).where(eq(indexOrgs.did, did));
    const animal = `at://${did}/pet.homeward.animal/3m5z2kq5qns2a`;
    await store.upsertAnimal(
      animal,
      pet.homeward.animal.$parse(
        jsonToLex({
          $type: 'pet.homeward.animal',
          name: 'Clyde',
          species: 'rabbit',
          photos: [
            {
              image: { $type: 'blob', ref: { $link: PHOTO }, mimeType: 'image/jpeg', size: 1751 },
              alt: 'Clyde in the hay',
            },
          ],
          createdAt,
        }),
      ),
      'c',
    );
    const listing = `at://${did}/pet.homeward.listing/3m5z2kq5qnsla`;
    await store.upsertListing(
      listing,
      pet.homeward.listing.$parse({
        $type: 'pet.homeward.listing',
        animals: [animal],
        status,
        createdAt,
      }),
      'c',
    );
    return { did, listing };
  }

  it('shows photos of animals in public listings of approved organisations', async () => {
    const { did } = await seed();
    expect(await isPublicPhoto(db, did, PHOTO)).toBe(true);
    expect(await isPublicPhoto(db, did, OTHER)).toBe(false);
    expect(await isPublicPhoto(db, 'did:plc:someoneelse', PHOTO)).toBe(false);
    expect(await isPublicPhoto(db, (await seed('adopted')).did, PHOTO)).toBe(true);
  });

  it('hides them once withdrawn, hidden after a report, or the approval is revoked', async () => {
    expect(await isPublicPhoto(db, (await seed('withdrawn')).did, PHOTO)).toBe(false);

    const hidden = await seed();
    await db
      .update(indexListings)
      .set({ moderation: 'hidden' })
      .where(eq(indexListings.uri, hidden.listing));
    expect(await isPublicPhoto(db, hidden.did, PHOTO)).toBe(false);

    const revoked = await seed();
    await db.update(indexOrgs).set({ trusted: false }).where(eq(indexOrgs.did, revoked.did));
    expect(await isPublicPhoto(db, revoked.did, PHOTO)).toBe(false);
  });
});
