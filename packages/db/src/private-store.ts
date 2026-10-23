import { TID } from '@atproto/common-web';
import { jsonToLex, lexToJson } from '@atproto/lex';
import { isValidDid, isValidRecordKey, isValidTid } from '@atproto/syntax';
import { pet } from '@homeward/lexicons';
import { and, asc, eq, gt, ne, sql } from 'drizzle-orm';
import { open, seal, type Keyring } from './crypto';
import type { Db } from './index';
import { privateRecords } from './schema';

/** Private collections, their schemas and record-key rules. */
const PRIVATE = {
  'pet.homeward.adopter.household': { schema: pet.homeward.adopter.household.main, key: 'self' },
  'pet.homeward.adopter.location': { schema: pet.homeward.adopter.location.main, key: 'self' },
  'pet.homeward.adopter.savedSearch': {
    schema: pet.homeward.adopter.savedSearch.main,
    key: 'tid',
  },
  'pet.homeward.animal.identification': {
    schema: pet.homeward.animal.identification.main,
    key: 'any',
  },
  /**
   * Drafts of animals not listed yet: private until a listing containing them is published
   * (#33), then moved to the organisation's repository under the same record key (#31).
   */
  'pet.homeward.animal': { schema: pet.homeward.animal.main, key: 'tid' },
} as const;

export type PrivateCollection = keyof typeof PRIVATE;

export interface PrivateRecords {
  'pet.homeward.adopter.household': pet.homeward.adopter.household.Main;
  'pet.homeward.adopter.location': pet.homeward.adopter.location.Main;
  'pet.homeward.adopter.savedSearch': pet.homeward.adopter.savedSearch.Main;
  'pet.homeward.animal.identification': pet.homeward.animal.identification.Main;
  'pet.homeward.animal': pet.homeward.animal.Main;
}

export interface PrivateListResult<C extends PrivateCollection> {
  records: Array<{ rkey: string; value: PrivateRecords[C] }>;
  cursor?: string;
}

export class PrivateStoreError extends Error {}

export interface RecordAddress {
  did: string;
  collection: string;
  rkey: string;
}

export interface RotationResult {
  rotated: number;
  /** Rows that could not be decrypted; they stay on their old key. */
  failed: RecordAddress[];
  /** Pass to the next call; undefined when the walk is complete. */
  cursor?: RecordAddress;
}

/**
 * Storage for private records, addressed like repository records (did, collection, rkey).
 * The Postgres implementation below is the MVP; an atproto Spaces implementation can
 * replace it without callers changing (spec §3).
 *
 * Authorisation is the caller's job: only call this for the signed-in user's own DID.
 */
export interface PrivateStore {
  get<C extends PrivateCollection>(
    did: string,
    collection: C,
    rkey: string,
  ): Promise<PrivateRecords[C] | undefined>;
  put<C extends PrivateCollection>(
    did: string,
    collection: C,
    rkey: string,
    record: PrivateRecords[C],
  ): Promise<void>;
  delete(did: string, collection: PrivateCollection, rkey: string): Promise<boolean>;
  list<C extends PrivateCollection>(
    did: string,
    collection: C,
    options?: { limit?: number; cursor?: string },
  ): Promise<PrivateListResult<C>>;
  /** Everything stored for a DID, decrypted (GDPR access/portability). */
  exportAll(did: string): Promise<Array<{ collection: string; rkey: string; value: unknown }>>;
  /** Deletes everything stored for a DID (GDPR erasure). Returns the number of records. */
  deleteAll(did: string): Promise<number>;
}

export function newRecordKey(): string {
  return TID.nextStr();
}

/** Binds each ciphertext to its location so rows can't be swapped between users. */
function associatedData(did: string, collection: string, rkey: string): string {
  return `${did}\n${collection}\n${rkey}`;
}

function assertAddress(did: string, collection: string, rkey: string): void {
  if (!isValidDid(did)) throw new PrivateStoreError(`Invalid DID: ${did}`);
  const spec = PRIVATE[collection as PrivateCollection];
  if (!spec) throw new PrivateStoreError(`Not a private collection: ${collection}`);
  const valid =
    spec.key === 'self'
      ? rkey === 'self'
      : spec.key === 'tid'
        ? isValidTid(rkey)
        : isValidRecordKey(rkey);
  if (!valid) throw new PrivateStoreError(`Invalid record key "${rkey}" for ${collection}`);
}

export class PostgresPrivateStore implements PrivateStore {
  constructor(
    private readonly db: Db,
    private readonly keyring: Keyring,
  ) {}

  async get<C extends PrivateCollection>(did: string, collection: C, rkey: string) {
    assertAddress(did, collection, rkey);
    const [row] = await this.db
      .select()
      .from(privateRecords)
      .where(this.where(did, collection, rkey))
      .limit(1);
    return row ? (this.decrypt(row) as PrivateRecords[C]) : undefined;
  }

  async put<C extends PrivateCollection>(
    did: string,
    collection: C,
    rkey: string,
    record: PrivateRecords[C],
  ) {
    assertAddress(did, collection, rkey);
    const result = PRIVATE[collection].schema.safeParse(record);
    if (!result.success) {
      throw new PrivateStoreError(`Invalid ${collection} record: ${result.reason.message}`);
    }
    const sealed = seal(
      this.keyring,
      // atproto JSON, so blob references and CIDs (e.g. a draft's photos) survive the round trip.
      Buffer.from(JSON.stringify(lexToJson(record)), 'utf8'),
      associatedData(did, collection, rkey),
    );
    const values = { keyId: sealed.keyId, iv: sealed.iv, ciphertext: sealed.data };
    await this.db
      .insert(privateRecords)
      .values({ did, collection, rkey, ...values })
      .onConflictDoUpdate({
        target: [privateRecords.did, privateRecords.collection, privateRecords.rkey],
        set: { ...values, updatedAt: sql`now()` },
      });
  }

  async delete(did: string, collection: PrivateCollection, rkey: string) {
    assertAddress(did, collection, rkey);
    const deleted = await this.db
      .delete(privateRecords)
      .where(this.where(did, collection, rkey))
      .returning({ rkey: privateRecords.rkey });
    return deleted.length > 0;
  }

  async list<C extends PrivateCollection>(
    did: string,
    collection: C,
    { limit = 50, cursor }: { limit?: number; cursor?: string } = {},
  ): Promise<PrivateListResult<C>> {
    if (!isValidDid(did)) throw new PrivateStoreError(`Invalid DID: ${did}`);
    const pageSize = Math.min(Math.max(limit, 1), 100);
    const rows = await this.db
      .select()
      .from(privateRecords)
      .where(
        and(
          eq(privateRecords.did, did),
          eq(privateRecords.collection, collection),
          cursor ? gt(privateRecords.rkey, cursor) : undefined,
        ),
      )
      .orderBy(asc(privateRecords.rkey))
      .limit(pageSize + 1);
    const page = rows.slice(0, pageSize);
    return {
      records: page.map((row) => ({
        rkey: row.rkey,
        value: this.decrypt(row) as PrivateRecords[C],
      })),
      cursor: rows.length > pageSize ? page.at(-1)?.rkey : undefined,
    };
  }

  async exportAll(did: string) {
    if (!isValidDid(did)) throw new PrivateStoreError(`Invalid DID: ${did}`);
    const rows = await this.db
      .select()
      .from(privateRecords)
      .where(eq(privateRecords.did, did))
      .orderBy(asc(privateRecords.collection), asc(privateRecords.rkey));
    return rows.map((row) => ({
      collection: row.collection,
      rkey: row.rkey,
      value: this.decrypt(row),
    }));
  }

  async deleteAll(did: string) {
    if (!isValidDid(did)) throw new PrivateStoreError(`Invalid DID: ${did}`);
    const deleted = await this.db
      .delete(privateRecords)
      .where(eq(privateRecords.did, did))
      .returning({ rkey: privateRecords.rkey });
    return deleted.length;
  }

  /**
   * Re-encrypts one batch of rows that are not on the active key, walking the table in
   * key order. Call again with the returned cursor until it is undefined; once nothing
   * has failed, the old key can be removed. Rows that cannot be decrypted (unknown key,
   * tampering) are reported and skipped rather than blocking the rotation.
   */
  async rotateKeys({
    batchSize = 500,
    cursor,
  }: { batchSize?: number; cursor?: RecordAddress } = {}): Promise<RotationResult> {
    const rows = await this.db
      .select()
      .from(privateRecords)
      .where(
        and(
          ne(privateRecords.keyId, this.keyring.activeKeyId),
          cursor
            ? sql`(${privateRecords.did}, ${privateRecords.collection}, ${privateRecords.rkey}) > (${cursor.did}, ${cursor.collection}, ${cursor.rkey})`
            : undefined,
        ),
      )
      .orderBy(asc(privateRecords.did), asc(privateRecords.collection), asc(privateRecords.rkey))
      .limit(batchSize);

    const result: RotationResult = { rotated: 0, failed: [] };
    for (const row of rows) {
      const address = { did: row.did, collection: row.collection, rkey: row.rkey };
      let plaintext: Buffer;
      try {
        plaintext = this.open(row);
      } catch {
        result.failed.push(address);
        continue;
      }
      const sealed = seal(
        this.keyring,
        plaintext,
        associatedData(row.did, row.collection, row.rkey),
      );
      await this.db
        .update(privateRecords)
        .set({ keyId: sealed.keyId, iv: sealed.iv, ciphertext: sealed.data })
        .where(this.where(row.did, row.collection, row.rkey));
      result.rotated++;
    }
    const last = rows.at(-1);
    if (rows.length === batchSize && last) {
      result.cursor = { did: last.did, collection: last.collection, rkey: last.rkey };
    }
    return result;
  }

  private where(did: string, collection: string, rkey: string) {
    return and(
      eq(privateRecords.did, did),
      eq(privateRecords.collection, collection),
      eq(privateRecords.rkey, rkey),
    );
  }

  private open(row: typeof privateRecords.$inferSelect): Buffer {
    return open(
      this.keyring,
      { keyId: row.keyId, iv: row.iv, data: row.ciphertext },
      associatedData(row.did, row.collection, row.rkey),
    );
  }

  private decrypt(row: typeof privateRecords.$inferSelect): unknown {
    return jsonToLex(JSON.parse(this.open(row).toString('utf8')));
  }
}
