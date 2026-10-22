import { customType, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

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
