import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from './index';
import { indexAnimals, indexListings, indexOrgs } from './schema';

/** Listing statuses the public can see; reserved and adopted say so in words. */
export const PUBLIC_LISTING_STATUSES = ['available', 'reserved', 'adopted'] as const;

/**
 * Whether Homeward may show a photo publicly (#26): it belongs to an animal in a listing the
 * public can see, from an approved organisation, not hidden after a report. Checked on every
 * request, so withdrawals and takedowns apply at once.
 */
export async function isPublicPhoto(db: Db, did: string, cid: string): Promise<boolean> {
  // Blob references as stored (atproto JSON): {"image": {"ref": {"$link": "<cid>"}}}.
  const photo = JSON.stringify([{ image: { ref: { $link: cid } } }]);
  const rows = await db
    .select({ uri: indexAnimals.uri })
    .from(indexAnimals)
    .innerJoin(
      indexListings,
      and(
        eq(indexListings.did, indexAnimals.did),
        sql`${indexAnimals.uri} = any(${indexListings.animalUris})`,
      ),
    )
    .innerJoin(indexOrgs, eq(indexOrgs.did, indexListings.did))
    .where(
      and(
        eq(indexAnimals.did, did),
        eq(indexOrgs.trusted, true),
        eq(indexListings.moderation, 'visible'),
        inArray(indexListings.status, [...PUBLIC_LISTING_STATUSES]),
        sql`${indexAnimals.record} -> 'photos' @> ${photo}::jsonb`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}
