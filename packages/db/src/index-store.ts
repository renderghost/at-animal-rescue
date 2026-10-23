import { lexToJson } from '@atproto/lex';
import type { pet } from '@homeward/lexicons';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from './index';
import { indexAnimals, indexListings, indexOrgs } from './schema';

type OrgProfile = pet.homeward.org.profile.Main;
type Animal = pet.homeward.animal.Main;
type Listing = pet.homeward.listing.Main;
type Place = pet.homeward.defs.Place;

export interface IndexedRef {
  uri: string;
  cid: string;
}

/** Parses a coarse lexicon coordinate string; out-of-range or malformed values are dropped. */
export function parseCoordinates(
  place: Place | undefined,
): { latitude: number; longitude: number } | undefined {
  if (!place?.latitude || !place.longitude) return undefined;
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  return { latitude, longitude };
}

/** Splits an AT URI into its parts. */
export function parseAtUri(uri: string): { did: string; collection: string; rkey: string } {
  const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!match) throw new Error(`Not a record AT URI: ${uri}`);
  return { did: match[1]!, collection: match[2]!, rkey: match[3]! };
}

function recordTimestamp(value: string): Date {
  const date = new Date(value);
  // Records are user-controlled: don't let a bogus createdAt jump the queue.
  return Number.isNaN(date.getTime()) || date.getTime() > Date.now() ? new Date() : date;
}

/**
 * Writes validated public records into the index. Callers (indexer, write-through) must
 * validate records against their lexicons first; this layer enforces cross-record rules
 * such as "a listing only references animals in its own repository".
 */
export class IndexStore {
  constructor(private readonly db: Db) {}

  async upsertOrg(did: string, record: OrgProfile, cid: string, handle?: string): Promise<void> {
    const coordinates = parseCoordinates(record.location);
    const values = {
      handle: handle ?? null,
      displayName: record.displayName,
      locality: record.location.locality,
      region: record.location.region ?? null,
      country: record.location.country.toUpperCase(),
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      // Stored in standard atproto JSON (blob refs as $link), as served to clients.
      record: lexToJson(record),
      cid,
      indexedAt: new Date(),
    };
    await this.db.transaction(async (tx) => {
      await tx
        .insert(indexOrgs)
        .values({ did, ...values })
        .onConflictDoUpdate({
          target: indexOrgs.did,
          // Keep the known handle if this update didn't carry one.
          set: { ...values, handle: handle ?? sql`${indexOrgs.handle}` },
        });
      // Listings without their own location follow the organisation's.
      await tx
        .update(indexListings)
        .set({ latitude: values.latitude, longitude: values.longitude })
        .where(and(eq(indexListings.did, did), isNull(indexListings.overrideLatitude)));
    });
  }

  async upsertAnimal(uri: string, record: Animal, cid: string): Promise<void> {
    const { did, rkey } = parseAtUri(uri);
    const values = {
      did,
      rkey,
      name: record.name,
      species: record.species,
      sex: record.sex ?? null,
      size: record.size ?? null,
      birthDate: record.birth?.date ?? null,
      breeds: record.breeds ?? [],
      record: lexToJson(record),
      cid,
      indexedAt: new Date(),
    };
    await this.db
      .insert(indexAnimals)
      .values({ uri, ...values })
      .onConflictDoUpdate({ target: indexAnimals.uri, set: values });
  }

  async upsertListing(uri: string, record: Listing, cid: string): Promise<void> {
    const { did, rkey } = parseAtUri(uri);
    const ownAnimals = `at://${did}/pet.homeward.animal/`;
    const animalUris = [...new Set(record.animals.filter((a) => a.startsWith(ownAnimals)))];
    const override = parseCoordinates(record.location);

    await this.db.transaction(async (tx) => {
      const [org] = await tx
        .select({
          latitude: indexOrgs.latitude,
          longitude: indexOrgs.longitude,
          trusted: indexOrgs.trusted,
        })
        .from(indexOrgs)
        .where(eq(indexOrgs.did, did))
        .limit(1);
      const values = {
        did,
        rkey,
        status: record.status,
        bonded: record.bonded ?? false,
        animalUris,
        criteria: record.criteria ?? [],
        feeKind: record.adoptionFee?.kind ?? null,
        feeAmount: record.adoptionFee?.amount?.amount ?? null,
        feeCurrency: record.adoptionFee?.amount?.currency ?? null,
        overrideLatitude: override?.latitude ?? null,
        overrideLongitude: override?.longitude ?? null,
        latitude: override?.latitude ?? org?.latitude ?? null,
        longitude: override?.longitude ?? org?.longitude ?? null,
        record: lexToJson(record),
        cid,
        createdAt: recordTimestamp(record.createdAt),
        indexedAt: new Date(),
      };
      await tx
        .insert(indexListings)
        // New listings from organisations not yet trusted wait for review (#43).
        .values({ uri, ...values, moderation: org?.trusted ? 'approved' : 'pending' })
        // Edits keep the current moderation state.
        .onConflictDoUpdate({ target: indexListings.uri, set: values });
    });
  }

  /** Removes one record (any of our collections) after a delete on the network. */
  async deleteRecord(uri: string): Promise<void> {
    const { did, collection } = parseAtUri(uri);
    if (collection === 'pet.homeward.org.profile') {
      await this.db.delete(indexOrgs).where(eq(indexOrgs.did, did));
    } else if (collection === 'pet.homeward.animal') {
      await this.db.delete(indexAnimals).where(eq(indexAnimals.uri, uri));
    } else if (collection === 'pet.homeward.listing') {
      await this.db.delete(indexListings).where(eq(indexListings.uri, uri));
    }
  }

  /** Removes everything from one account (account deleted, taken down or erased). */
  async deleteRepo(did: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(indexListings).where(eq(indexListings.did, did));
      await tx.delete(indexAnimals).where(eq(indexAnimals.did, did));
      await tx.delete(indexOrgs).where(eq(indexOrgs.did, did));
    });
  }

  /** Updates the stored handle when an account's identity changes. */
  async updateHandle(did: string, handle: string): Promise<void> {
    await this.db.update(indexOrgs).set({ handle }).where(eq(indexOrgs.did, did));
  }
}
