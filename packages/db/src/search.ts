import { sql, type SQL } from 'drizzle-orm';
import type { Db } from './index';

export interface ListingSearch {
  species?: string[];
  sizes?: string[];
  sexes?: string[];
  bonded?: boolean;
  /** Defaults to listings people can still adopt: available and reserved. */
  statuses?: string[];
  orgDid?: string;
  near?: { latitude: number; longitude: number; maxKm?: number };
  sort?: 'newest' | 'nearest';
  limit?: number;
  cursor?: string;
  /** Include listings not yet approved, e.g. an organisation viewing its own. */
  includeUnmoderated?: boolean;
}

export interface ListingSearchResult {
  uri: string;
  did: string;
  status: string;
  bonded: boolean;
  moderation: string;
  createdAt: Date;
  criteria: unknown[];
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
  if (!search.includeUnmoderated) where.push(sql`l.moderation = 'approved'`);
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
    SELECT
      l.uri, l.did, l.status, l.bonded, l.moderation, l.created_at, l.criteria,
      l.fee_kind, l.fee_amount, l.fee_currency,
      o.display_name, o.handle, o.locality, o.region, o.country,
      ${distance} AS distance_km,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'uri', a.uri, 'name', a.name, 'species', a.species, 'sex', a.sex,
          'size', a.size, 'birthDate', a.birth_date, 'record', a.record
        ) ORDER BY array_position(l.animal_uris, a.uri)), '[]'::json)
        FROM index_animals a WHERE a.uri = ANY(l.animal_uris)
      ) AS animals
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
    createdAt: new Date(row.created_at as string),
    criteria: row.criteria as unknown[],
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
