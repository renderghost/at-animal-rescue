# @homeward/db

Postgres access (Drizzle + postgres.js), migrations and the **private store**.

## Private store

Private records (adopter household and location, saved searches, animal identification) never go to a public repository. They are kept here, encrypted at rest. Spec §3.

- **Shape:** records are lexicon-validated, atproto-shaped, and addressed like repository records (`did`, `collection`, `rkey`). `PrivateStore` is the interface; `PostgresPrivateStore` is the MVP implementation. An atproto Spaces implementation can replace it later without callers changing.
- **Encryption:** AES-256-GCM with a random IV per write. The ciphertext is bound to its `did/collection/rkey` as associated data, so a row copied to another user or location fails to decrypt.
- **Data minimisation:** adopter location is rounded to about 1 km before it's stored.
- **Authorisation:** this is the caller's job. Only read or write the signed-in user's own DID.
- **GDPR:** `exportAll(did)` covers access and portability; `deleteAll(did)` covers erasure.

### Keys

```sh
PRIVATE_STORE_KEYS=2026a:<base64 32 bytes>,2027a:<base64 32 bytes>
PRIVATE_STORE_ACTIVE_KEY=2027a
```

Generate a key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.

To rotate:

1. Add a new key and make it active.
2. Call `rotateKeys({ cursor })` until the cursor is undefined.
3. Check `failed` is empty, then remove the old key.

## Public index

`IndexStore` writes validated public records (`pet.homeward.org.profile`, `animal`, `listing`) into `index_*` tables. `searchListings()` serves discovery and organisation pages. Everything here can be rebuilt from the network, and nothing private is stored.

- **Validation:** callers validate records against their lexicons first. The store enforces cross-record rules: a listing only references animals in its own repository, and a listing is only shown if its repository has an organisation profile and at least one indexed animal.
- **Moderation:** new listings from organisations not yet `trusted` start as `pending` and stay out of discovery until approved (#43). Edits keep the current state.
- **Location:** each listing gets an effective location (its own override, else its organisation's), kept in sync when either changes. A PostGIS GiST index serves distance search.
- **Search:** filters for species, size, sex, bonded, status (default available and reserved), organisation and maximum distance. Sorted newest (keyset cursor) or nearest (offset cursor).

## Migrations

```sh
pnpm --filter @homeward/db db:generate   # after changing src/schema.ts
pnpm db:migrate                          # apply
```

The integration tests (`*.test.ts` using `DATABASE_URL`) need a migrated database. Locally, run `pnpm services:up && pnpm db:migrate`; CI provides Postgres.
