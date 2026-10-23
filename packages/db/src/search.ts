import { AGE_THRESHOLDS, birthDateRange, type AgeGroup } from '@homeward/lexicons';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from './index';

const LISTING = 'pet.homeward.listing#';

/**
 * Filters on what a listing states about the home it needs. Only listings that say so
 * match: a listing that doesn't mention children is not "good with children" (spec §2).
 */
export const STATED_CRITERIA = {
  children: { $type: `${LISTING}childrenCriterion`, allowed: true },
  dogs: { $type: `${LISTING}otherAnimalsCriterion`, animal: 'dog', allowed: true },
  cats: { $type: `${LISTING}otherAnimalsCriterion`, animal: 'cat', allowed: true },
  firstTimeOwners: { $type: `${LISTING}experienceCriterion`, minimum: 'none' },
  flat: { $type: `${LISTING}homeTypeCriterion`, allowed: ['flat'] },
} as const;
export type StatedCriterion = keyof typeof STATED_CRITERIA;

export interface ListingSearch {
  species?: string[];
  sizes?: string[];
  sexes?: string[];
  bonded?: boolean;
  /** Age groups, worked out per species from each animal's birth date. */
  ageGroups?: AgeGroup[];
  criteria?: StatedCriterion[];
  /** Defaults to listings people can still adopt: available and reserved. */
  statuses?: string[];
  orgDid?: string;
  near?: { latitude: number; longitude: number; maxKm?: number };
  sort?: 'newest' | 'nearest';
  limit?: number;
  cursor?: string;
  /**
   * Include listings that aren't public: from an organisation not yet approved, or hidden
   * after a report. Only for an organisation viewing its own.
   */
  includeUnmoderated?: boolean;
  now?: Date;
}

export interface ListingSearchResult {
  uri: string;
  did: string;
  status: string;
  bonded: boolean;
  moderation: string;
  /** Whether the organisation has been approved, so its listings are public. */
  orgApproved: boolean;
  createdAt: Date;
  criteria: unknown[];
  /** The listing record in atproto JSON, as published (validate before use). */
  record: unknown;
  fee?: { kind: string; amount?: number; currency?: string };
  distanceKm?: number;
  org: { displayName: string; handle?: string; locality: string; region?: string; country: string };
  animals: Array<{
    uri: string;
    name: string;
    species: string;
    sex?: string;
    size?: string;
    birthDate?: string;
    record: unknown;
  }>;
}

export interface ListingSearchPage {
  listings: ListingSearchResult[];
  cursor?: string;
}

type Cursor = { createdAt: string; uri: string } | { offset: number };

const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url');

function decodeCursor(cursor: string | undefined): Cursor | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Cursor;
  } catch {
    return undefined;
  }
}

/** A bound text[] parameter. (Drizzle expands a bare JS array into a row, not an array.) */
function textArray(values: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

const listingPoint = sql`ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326)::geography`;

/** What a search result holds: the listing, its organisation and its animals in order. */
const COLUMNS = sql`
  l.uri, l.did, l.status, l.bonded, l.moderation, o.trusted, l.created_at, l.criteria,
  l.record, l.fee_kind, l.fee_amount, l.fee_currency,
  o.display_name, o.handle, o.locality, o.region, o.country,
  (
    SELECT COALESCE(json_agg(json_build_object(
      'uri', a.uri, 'name', a.name, 'species', a.species, 'sex', a.sex,
      'size', a.size, 'birthDate', a.birth_date, 'record', a.record
    ) ORDER BY array_position(l.animal_uris, a.uri)), '[]'::json)
    FROM index_animals a WHERE a.uri = ANY(l.animal_uris)
  ) AS animals`;

/**
 * One listing by URI, whatever its status or moderation: the caller decides who may see it
 * (the listing page, #35).
 */
export async function getListing(db: Db, uri: string): Promise<ListingSearchResult | undefined> {
  const rows = (await db.execute(sql`
    SELECT ${COLUMNS}, NULL AS distance_km
    FROM index_listings l
    JOIN index_orgs o ON o.did = l.did
    WHERE l.uri = ${uri}
  `)) as unknown as Array<Record<string, unknown>>;
  return rows[0] && toResult(rows[0]);
}

/** Network-wide listing search for discovery and organisation profiles (spec §2). */
export async function searchListings(
  db: Db,
  search: ListingSearch = {},
): Promise<ListingSearchPage> {
  const limit = Math.min(Math.max(search.limit ?? 24, 1), 100);
  const sort = search.sort === 'nearest' && search.near ? 'nearest' : 'newest';
  const cursor = decodeCursor(search.cursor);
  const near = search.near;
  const point = near
    ? sql`ST_SetSRID(ST_MakePoint(${near.longitude}, ${near.latitude}), 4326)::geography`
    : undefined;

  const where: SQL[] = [
    sql`l.status = ANY(${textArray(search.statuses ?? ['available', 'reserved'])})`,
    // A listing needs at least one indexed animal to be shown.
    sql`EXISTS (SELECT 1 FROM index_animals a WHERE a.uri = ANY(l.animal_uris))`,
  ];
  // Public only once the organisation is approved, and unless a report has hidden it.
  if (!search.includeUnmoderated) where.push(sql`o.trusted AND l.moderation <> 'hidden'`);
  if (search.orgDid) where.push(sql`l.did = ${search.orgDid}`);
  if (search.bonded !== undefined) where.push(sql`l.bonded = ${search.bonded}`);
  for (const [column, values] of [
    ['species', search.species],
    ['size', search.sizes],
    ['sex', search.sexes],
  ] as const) {
    if (values?.length) {
      where.push(
        sql`EXISTS (SELECT 1 FROM index_animals a WHERE a.uri = ANY(l.animal_uris) AND ${sql.raw(`a.${column}`)} = ANY(${textArray(values)}))`,
      );
    }
  }
  if (search.ageGroups?.length) {
    const ages = ageConditions(search.ageGroups, search.species, search.now ?? new Date());
    where.push(
      ages.length > 0
        ? sql`EXISTS (SELECT 1 FROM index_animals a WHERE a.uri = ANY(l.animal_uris) AND (${sql.join(ages, sql` OR `)}))`
        : sql`FALSE`,
    );
  }
  for (const key of search.criteria ?? []) {
    where.push(sql`l.criteria @> ${JSON.stringify([STATED_CRITERIA[key]])}::jsonb`);
  }
  if (point && near?.maxKm !== undefined) {
    where.push(sql`ST_DWithin(${listingPoint}, ${point}, ${near.maxKm * 1000})`);
  }
  if (sort === 'newest' && cursor && 'createdAt' in cursor) {
    where.push(sql`(l.created_at, l.uri) < (${cursor.createdAt}::timestamptz, ${cursor.uri})`);
  }

  const distance = point
    ? sql`CASE WHEN l.latitude IS NOT NULL THEN ST_Distance(${listingPoint}, ${point}) / 1000 END`
    : sql`NULL::double precision`;
  const orderBy =
    sort === 'nearest'
      ? sql`distance_km ASC NULLS LAST, l.uri ASC`
      : sql`l.created_at DESC, l.uri DESC`;
  const offset = sort === 'nearest' && cursor && 'offset' in cursor ? cursor.offset : 0;

  const rows = (await db.execute(sql`
    SELECT ${COLUMNS}, ${distance} AS distance_km
    FROM index_listings l
    JOIN index_orgs o ON o.did = l.did
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY ${orderBy}
    LIMIT ${limit + 1} OFFSET ${offset}
  `)) as unknown as Array<Record<string, unknown>>;

  const page = rows.slice(0, limit);
  const listings = page.map(toResult);
  let next: Cursor | undefined;
  if (rows.length > limit) {
    const last = listings.at(-1)!;
    next =
      sort === 'nearest'
        ? { offset: offset + limit }
        : { createdAt: last.createdAt.toISOString(), uri: last.uri };
  }
  return { listings, cursor: next && encodeCursor(next) };
}

/** Birth-date windows for the age groups, per species (thresholds differ by species). */
function ageConditions(
  groups: readonly AgeGroup[],
  species: string[] | undefined,
  now: Date,
): SQL[] {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const conditions: SQL[] = [];
  for (const kind of Object.keys(AGE_THRESHOLDS)) {
    if (species?.length && !species.includes(kind)) continue;
    for (const group of groups) {
      const range = birthDateRange(kind, group, now);
      if (!range) continue;
      const bounds = [sql`a.species = ${kind}`, sql`a.birth_estimate IS NOT NULL`];
      if (range.after) bounds.push(sql`a.birth_estimate > ${day(range.after)}::date`);
      if (range.before) bounds.push(sql`a.birth_estimate <= ${day(range.before)}::date`);
      conditions.push(sql`(${sql.join(bounds, sql` AND `)})`);
    }
  }
  return conditions;
}

function toResult(row: Record<string, unknown>): ListingSearchResult {
  const optional = <T>(value: unknown) => (value === null ? undefined : (value as T));
  const feeKind = optional<string>(row.fee_kind);
  const animals = (row.animals as ListingSearchResult['animals']).map((a) => ({
    uri: a.uri,
    name: a.name,
    species: a.species,
    sex: optional<string>(a.sex),
    size: optional<string>(a.size),
    birthDate: optional<string>(a.birthDate),
    record: a.record,
  }));
  return {
    uri: row.uri as string,
    did: row.did as string,
    status: row.status as string,
    bonded: row.bonded as boolean,
    moderation: row.moderation as string,
    orgApproved: row.trusted as boolean,
    createdAt: new Date(row.created_at as string),
    criteria: row.criteria as unknown[],
    record: row.record,
    fee: feeKind
      ? {
          kind: feeKind,
          amount: optional<number>(row.fee_amount),
          currency: optional<string>(row.fee_currency),
        }
      : undefined,
    distanceKm: row.distance_km === null ? undefined : Number(row.distance_km),
    org: {
      displayName: row.display_name as string,
      handle: optional<string>(row.handle),
      locality: row.locality as string,
      region: optional<string>(row.region),
      country: row.country as string,
    },
    animals,
  };
}
