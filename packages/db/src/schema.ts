import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * Private, atproto-shaped records (spec §3), encrypted at rest with AES-256-GCM.
 * Addressed like repo records (did + collection + rkey) so they can move to atproto
 * Spaces later without remodelling.
 */
export const privateRecords = pgTable(
  'private_records',
  {
    did: text().notNull(),
    collection: text().notNull(),
    rkey: text().notNull(),
    keyId: text('key_id').notNull(),
    iv: bytea().notNull(),
    ciphertext: bytea().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.did, t.collection, t.rkey] }),
    index('private_records_key_id_idx').on(t.keyId),
  ],
);

/**
 * Signed-in sessions. The browser holds a random token; only its SHA-256 hash is stored,
 * so a database leak yields no usable cookies. The PDS session (access and refresh
 * tokens) is encrypted at rest with the private-store keyring.
 */
export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    did: text().notNull(),
    handle: text().notNull(),
    keyId: text('key_id').notNull(),
    iv: bytea().notNull(),
    ciphertext: bytea().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_did_idx').on(t.did), index('sessions_expires_at_idx').on(t.expiresAt)],
);

/*
 * Public index (AppView). Validated copies of public pet.homeward.* records from across
 * the network, kept up to date by the indexer (#23) and write-through (#24). Everything
 * here can be rebuilt from the network; nothing private is stored.
 */

export const indexOrgs = pgTable('index_orgs', {
  did: text().primaryKey(),
  handle: text(),
  displayName: text('display_name').notNull(),
  locality: text().notNull(),
  region: text(),
  country: text().notNull(),
  latitude: doublePrecision(),
  longitude: doublePrecision(),
  /** Set by moderators once an organisation's listings no longer need review (#43). */
  trusted: boolean().notNull().default(false),
  record: jsonb().notNull(),
  cid: text().notNull(),
  indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const indexAnimals = pgTable(
  'index_animals',
  {
    uri: text().primaryKey(),
    did: text().notNull(),
    rkey: text().notNull(),
    name: text().notNull(),
    species: text().notNull(),
    sex: text(),
    size: text(),
    birthDate: text('birth_date'),
    breeds: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    record: jsonb().notNull(),
    cid: text().notNull(),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('index_animals_did_idx').on(t.did),
    index('index_animals_species_idx').on(t.species),
  ],
);

export const indexListings = pgTable(
  'index_listings',
  {
    uri: text().primaryKey(),
    did: text().notNull(),
    rkey: text().notNull(),
    status: text().notNull(),
    bonded: boolean().notNull().default(false),
    /** Only animals in the same repository as the listing. */
    animalUris: text('animal_uris').array().notNull(),
    criteria: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    feeKind: text('fee_kind'),
    feeAmount: integer('fee_amount'),
    feeCurrency: text('fee_currency'),
    /** The listing's own location override, if any. */
    overrideLatitude: doublePrecision('override_latitude'),
    overrideLongitude: doublePrecision('override_longitude'),
    /** Effective location: the override, else the organisation's. Kept in sync on upsert. */
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    /** pending until approved (#43); hidden after a successful report (#44). */
    moderation: text().notNull().default('pending'),
    record: jsonb().notNull(),
    cid: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('index_listings_did_idx').on(t.did),
    index('index_listings_discovery_idx').on(t.moderation, t.status, t.createdAt),
    index('index_listings_location_idx').using(
      'gist',
      sql`(ST_SetSRID(ST_MakePoint(${t.longitude}, ${t.latitude}), 4326)::geography)`,
    ),
  ],
);

/** Small key/value store for background services, e.g. the indexer's Jetstream cursor. */
export const serviceState = pgTable('service_state', {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
