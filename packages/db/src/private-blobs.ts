import { isValidDid } from '@atproto/syntax';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { open, seal, type Keyring } from './crypto';
import type { Db } from './index';
import { PrivateStoreError } from './private-store';
import { privateBlobs } from './schema';

export interface PrivateBlob {
  mimeType: string;
  bytes: Buffer;
}

export interface BlobAddress {
  did: string;
  /** The draft record the file belongs to, as `collection/rkey`. */
  record: string;
  cid: string;
}

export interface BlobRotationResult {
  rotated: number;
  /** Files that could not be decrypted; they stay on their old key. */
  failed: BlobAddress[];
  /** Pass to the next call; undefined when the walk is complete. */
  cursor?: BlobAddress;
}

/** Binds each ciphertext to its owner, record and content, so rows can't be swapped. */
const associatedData = ({ did, record, cid }: BlobAddress) => `${did}\nblob\n${record}\n${cid}`;

const at = ({ did, record, cid }: BlobAddress) =>
  and(eq(privateBlobs.did, did), eq(privateBlobs.record, record), eq(privateBlobs.cid, cid));

/**
 * Encrypted files for private drafts, such as photos of animals not listed yet (#32). Each
 * belongs to one draft record and is addressed by its CID, so the draft references it as it
 * will once it's on the PDS. Authorisation is the caller's job: only call this for the
 * signed-in user's own DID.
 */
export class PrivateBlobStore {
  constructor(
    private readonly db: Db,
    private readonly keyring: Keyring,
  ) {}

  async put(address: BlobAddress, mimeType: string, bytes: Buffer): Promise<void> {
    if (!isValidDid(address.did)) throw new PrivateStoreError(`Invalid DID: ${address.did}`);
    const sealed = seal(this.keyring, bytes, associatedData(address));
    const values = {
      mimeType,
      size: bytes.length,
      keyId: sealed.keyId,
      iv: sealed.iv,
      ciphertext: sealed.data,
    };
    await this.db
      .insert(privateBlobs)
      .values({ ...address, ...values })
      .onConflictDoUpdate({
        target: [privateBlobs.did, privateBlobs.record, privateBlobs.cid],
        set: values,
      });
  }

  async get(address: BlobAddress): Promise<PrivateBlob | undefined> {
    const [row] = await this.db.select().from(privateBlobs).where(at(address)).limit(1);
    if (!row) return undefined;
    const bytes = open(
      this.keyring,
      { keyId: row.keyId, iv: row.iv, data: row.ciphertext },
      associatedData(address),
    );
    return { mimeType: row.mimeType, bytes };
  }

  /** Deletes a record's files: the chosen ones, or all of them. */
  async delete(did: string, record: string, cids?: string[]): Promise<void> {
    if (cids?.length === 0) return;
    await this.db
      .delete(privateBlobs)
      .where(
        and(
          eq(privateBlobs.did, did),
          eq(privateBlobs.record, record),
          cids ? inArray(privateBlobs.cid, cids) : undefined,
        ),
      );
  }

  /** Deletes everything stored for a DID (GDPR erasure). Returns the number of files. */
  async deleteAll(did: string): Promise<number> {
    const deleted = await this.db
      .delete(privateBlobs)
      .where(eq(privateBlobs.did, did))
      .returning({ cid: privateBlobs.cid });
    return deleted.length;
  }

  /** Re-encrypts one batch onto the active key, like PostgresPrivateStore.rotateKeys. */
  async rotateKeys({
    batchSize = 100,
    cursor,
  }: { batchSize?: number; cursor?: BlobAddress } = {}): Promise<BlobRotationResult> {
    const rows = await this.db
      .select()
      .from(privateBlobs)
      .where(
        and(
          ne(privateBlobs.keyId, this.keyring.activeKeyId),
          cursor
            ? sql`(${privateBlobs.did}, ${privateBlobs.record}, ${privateBlobs.cid}) > (${cursor.did}, ${cursor.record}, ${cursor.cid})`
            : undefined,
        ),
      )
      .orderBy(asc(privateBlobs.did), asc(privateBlobs.record), asc(privateBlobs.cid))
      .limit(batchSize);
    const result: BlobRotationResult = { rotated: 0, failed: [] };
    for (const row of rows) {
      const address = { did: row.did, record: row.record, cid: row.cid };
      let bytes: Buffer;
      try {
        bytes = open(
          this.keyring,
          { keyId: row.keyId, iv: row.iv, data: row.ciphertext },
          associatedData(address),
        );
      } catch {
        result.failed.push(address);
        continue;
      }
      await this.put(address, row.mimeType, bytes);
      result.rotated++;
    }
    const last = rows.at(-1);
    if (rows.length === batchSize && last) {
      result.cursor = { did: last.did, record: last.record, cid: last.cid };
    }
    return result;
  }
}
