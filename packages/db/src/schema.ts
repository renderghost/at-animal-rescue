import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
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
  /**
   * Set when a moderator approves the organisation (#43). Until then none of its listings
   * are public; revoking approval hides them all again. Checked at query time.
   */
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
    /** The birth date as a date (partial dates estimated), for age-group filters. */
    birthEstimate: date('birth_estimate', { mode: 'string' }),
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
    /**
     * 'visible', or 'hidden' after a successful report (#44). Whether the organisation is
     * approved is checked separately, on index_orgs.trusted.
     */
    moderation: text().notNull().default('visible'),
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

/**
 * Facts about an organisation that Homeward has checked, shown on its page instead of a
 * "verified" badge (#29). Each part records when it was last checked.
 */
export const orgFacts = pgTable('org_facts', {
  did: text().primaryKey(),
  /** The handle checked, when it is the organisation's own domain (not a hosting provider). */
  domainHandle: text('domain_handle'),
  /** How the domain points back to the account: 'dns' or 'https'. */
  domainMethod: text('domain_method'),
  domainCheckedAt: timestamp('domain_checked_at', { withTimezone: true }),
  /** Valid verifications by trusted verifiers: [{ issuer, issuerHandle?, issuerName?, createdAt }]. */
  verifications: jsonb()
    .notNull()
    .default(sql`'[]'::jsonb`),
  verificationsCheckedAt: timestamp('verifications_checked_at', { withTimezone: true }),
});

/**
 * An organisation's contact email confirmation (#30): the address confirmed and when, plus
 * any code waiting to be entered. Kept here, never on the PDS.
 */
export const emailConfirmations = pgTable('email_confirmations', {
  did: text().primaryKey(),
  /** The address last confirmed (lower case). */
  email: text(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  /** The address a code was sent to, and a keyed hash of the code (never the code itself). */
  pendingEmail: text('pending_email'),
  codeHash: text('code_hash'),
  codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
  attempts: integer().notNull().default(0),
  /** Sends in the current hour, for rate limiting. */
  sendWindowStartedAt: timestamp('send_window_started_at', { withTimezone: true }),
  sendsInWindow: integer('sends_in_window').notNull().default(0),
});

/**
 * Files that belong to private drafts, such as photos of animals not listed yet (#32),
 * encrypted like private records and addressed by content (CID) so a draft's record can
 * reference them exactly as it will once they're uploaded to the PDS.
 */
export const privateBlobs = pgTable(
  'private_blobs',
  {
    did: text().notNull(),
    /** The draft record the file belongs to, as `collection/rkey`. */
    record: text().notNull(),
    cid: text().notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer().notNull(),
    keyId: text('key_id').notNull(),
    iv: bytea().notNull(),
    ciphertext: bytea().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.did, t.record, t.cid] })],
);

/**
 * Links an adopter sends with an enquiry (#42) so one organisation can read their answers
 * for one listing. Only a hash of each link's secret is stored; links expire, can be
 * withdrawn, and every opening is logged for the adopter to see.
 */
export const shareLinks = pgTable(
  'share_links',
  {
    id: text().primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    adopterDid: text('adopter_did').notNull(),
    /** Shown to the organisation; public anyway, and kept so viewing needs no lookup. */
    adopterHandle: text('adopter_handle').notNull(),
    orgDid: text('org_did').notNull(),
    listingUri: text('listing_uri').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('share_links_adopter').on(t.adopterDid)],
);

/** When each share link was opened: the time only, nothing about who or from where. */
export const shareLinkViews = pgTable(
  'share_link_views',
  {
    linkId: text('link_id')
      .notNull()
      .references(() => shareLinks.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('share_link_views_link').on(t.linkId)],
);

/**
 * Moderation of organisations (#43): the latest decision and its reason. Kept apart from
 * the index so it survives a rebuild; `index_orgs.trusted` mirrors "approved" for public
 * queries. No row means the organisation is waiting for its first review.
 */
export const orgReviews = pgTable('org_reviews', {
  did: text().primaryKey(),
  /** pending, approved, rejected or revoked. */
  state: text().notNull(),
  reason: text(),
  decidedBy: text('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  /** When the organisation last asked to be looked at again. */
  requestedAt: timestamp('requested_at', { withTimezone: true }),
});

/** Every moderation decision and request for review, for accountability between moderators. */
export const orgReviewLog = pgTable(
  'org_review_log',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    did: text().notNull(),
    /** approve, reject, revoke or requestReview. */
    action: text().notNull(),
    reason: text(),
    /** The moderator, or the organisation itself when it asks for another review. */
    actorDid: text('actor_did').notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('org_review_log_did').on(t.did, t.at)],
);

/**
 * Reports of listings under the DSA (#44): anyone can report; a moderator hides the listing
 * or takes no action. The reporter's contact details are erased six months after the
 * decision; the report itself stays, for the record.
 */
export const listingReports = pgTable(
  'listing_reports',
  {
    id: text().primaryKey(),
    /** Shown to the reporter, e.g. R-7KQ2MX. */
    reference: text().notNull().unique(),
    listingUri: text('listing_uri').notNull(),
    orgDid: text('org_did').notNull(),
    reason: text().notNull(),
    explanation: text().notNull(),
    reporterName: text('reporter_name'),
    reporterEmail: text('reporter_email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** open, actioned (the listing was hidden) or dismissed (no action). */
    state: text().notNull().default('open'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** Why, as told to the reporter. */
    decisionNote: text('decision_note'),
    contactErasedAt: timestamp('contact_erased_at', { withTimezone: true }),
  },
  (t) => [
    index('listing_reports_state').on(t.state, t.createdAt),
    index('listing_reports_listing').on(t.listingUri),
  ],
);

/**
 * Listings hidden after a report, with the statement of reasons (DSA Art. 17) and the
 * organisation's request for a second look (Art. 20). Kept apart from the rebuildable index;
 * `index_listings.moderation` mirrors it.
 */
export const listingHides = pgTable(
  'listing_hides',
  {
    listingUri: text('listing_uri').primaryKey(),
    orgDid: text('org_did').notNull(),
    /** The DSA transparency database category, e.g. STATEMENT_CATEGORY_ANIMAL_WELFARE. */
    category: text().notNull(),
    /** illegal (the law) or terms (Homeward's rules). */
    ground: text().notNull(),
    statement: text().notNull(),
    decidedBy: text('decided_by').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    appealText: text('appeal_text'),
    appealedAt: timestamp('appealed_at', { withTimezone: true }),
    appealDecidedAt: timestamp('appeal_decided_at', { withTimezone: true }),
    appealNote: text('appeal_note'),
  },
  (t) => [index('listing_hides_org').on(t.orgDid)],
);

/** Every step in a listing's moderation, kept as the audit log. */
export const listingModerationLog = pgTable(
  'listing_moderation_log',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    listingUri: text('listing_uri').notNull(),
    /** reported, hidden, dismissed, appealed, reinstated or upheld. */
    action: text().notNull(),
    reportId: text('report_id'),
    /** The moderator or organisation; empty for a report, which can be anonymous. */
    actorDid: text('actor_did'),
    note: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('listing_moderation_log_listing').on(t.listingUri, t.at)],
);

/**
 * Failed sign-ins (#67), to limit guessing app passwords through us. Only a keyed hash of
 * the account or client address is stored, and rows go once they're out of the window.
 */
export const signInFailures = pgTable(
  'sign_in_failures',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** "did:" or "ip:" followed by a keyed hash. */
    bucket: text().notNull(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sign_in_failures_bucket').on(t.bucket, t.at),
    index('sign_in_failures_at').on(t.at),
  ],
);
