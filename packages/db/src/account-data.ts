import { lexToJson } from '@atproto/lex';
import { isValidDid } from '@atproto/syntax';
import { asc, desc, eq } from 'drizzle-orm';
import type { Keyring } from './crypto';
import { EmailConfirmationStore } from './email-confirmations';
import type { Db } from './index';
import { PrivateBlobStore } from './private-blobs';
import { PostgresPrivateStore, PrivateStoreError } from './private-store';
import { emailConfirmations, orgReviewLog, orgReviews, privateBlobs, sessions } from './schema';
import { SessionStore } from './session-store';
import { ShareLinkStore } from './share-links';

/** Everything Homeward holds about one account, for "Download your data" (#46). */
export interface AccountExport {
  exportedAt: string;
  did: string;
  /** Adopter answers, saved searches, drafts and identification numbers, decrypted. */
  privateRecords: Array<{ collection: string; rkey: string; value: unknown }>;
  /** Files of drafts (such as photos of animals not listed yet), described but not included. */
  privateFiles: Array<{
    record: string;
    cid: string;
    mimeType: string;
    size: number;
    createdAt: string;
  }>;
  /** When each signed-in session started and was last used; never its secrets. */
  sessions: Array<{ createdAt: string; lastSeenAt: string; expiresAt: string }>;
  shareLinks: Array<{
    orgDid: string;
    listingUri: string;
    createdAt: string;
    expiresAt: string;
    revokedAt?: string;
    state: string;
    views: number;
    lastViewedAt?: string;
  }>;
  emailConfirmation?: { email?: string; confirmedAt?: string; pendingEmail?: string };
  /** Moderators' decisions about the organisation, without naming the moderators. */
  moderation?: {
    state: string;
    reason?: string;
    decidedAt?: string;
    history: Array<{ action: string; reason?: string; byYou: boolean; at: string }>;
  };
}

export interface ErasureSummary {
  privateRecords: number;
  privateFiles: number;
  shareLinks: number;
  sessions: number;
}

const iso = (date: Date | null | undefined) => date?.toISOString();

/**
 * Export and erasure of what Homeward holds about an account (#46). Public records live in
 * the account's own repository and are left to the caller; moderation decisions are kept
 * on erasure, for accountability (DSA), and are part of the export.
 */
export class AccountDataStore {
  private readonly records: PostgresPrivateStore;
  private readonly files: PrivateBlobStore;
  private readonly sessionStore: SessionStore<unknown>;
  private readonly shareLinks: ShareLinkStore;
  private readonly confirmations: EmailConfirmationStore;

  constructor(
    private readonly db: Db,
    keyring: Keyring,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.records = new PostgresPrivateStore(db, keyring);
    this.files = new PrivateBlobStore(db, keyring);
    this.sessionStore = new SessionStore(db, keyring, now);
    this.shareLinks = new ShareLinkStore(db, now);
    this.confirmations = new EmailConfirmationStore(db, keyring, now);
  }

  async export(did: string): Promise<AccountExport> {
    if (!isValidDid(did)) throw new PrivateStoreError(`Invalid DID: ${did}`);
    const [records, files, sessionRows, links, [confirmation], review, history] = await Promise.all(
      [
        this.records.exportAll(did),
        this.db
          .select({
            record: privateBlobs.record,
            cid: privateBlobs.cid,
            mimeType: privateBlobs.mimeType,
            size: privateBlobs.size,
            createdAt: privateBlobs.createdAt,
          })
          .from(privateBlobs)
          .where(eq(privateBlobs.did, did))
          .orderBy(asc(privateBlobs.record), asc(privateBlobs.cid)),
        this.db
          .select({
            createdAt: sessions.createdAt,
            lastSeenAt: sessions.lastSeenAt,
            expiresAt: sessions.expiresAt,
          })
          .from(sessions)
          .where(eq(sessions.did, did))
          .orderBy(desc(sessions.createdAt)),
        this.shareLinks.listForAdopter(did),
        this.db
          .select({
            email: emailConfirmations.email,
            confirmedAt: emailConfirmations.confirmedAt,
            pendingEmail: emailConfirmations.pendingEmail,
          })
          .from(emailConfirmations)
          .where(eq(emailConfirmations.did, did)),
        this.db.select().from(orgReviews).where(eq(orgReviews.did, did)),
        this.db
          .select()
          .from(orgReviewLog)
          .where(eq(orgReviewLog.did, did))
          .orderBy(desc(orgReviewLog.at), desc(orgReviewLog.id)),
      ],
    );
    const decision = review[0];
    return {
      exportedAt: this.now().toISOString(),
      did,
      privateRecords: records.map(({ collection, rkey, value }) => ({
        collection,
        rkey,
        // Standard atproto JSON, as the records would be in a repository.
        value: lexToJson(value as Parameters<typeof lexToJson>[0]),
      })),
      privateFiles: files.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() })),
      sessions: sessionRows.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      })),
      shareLinks: links.map((link) => ({
        orgDid: link.orgDid,
        listingUri: link.listingUri,
        createdAt: link.createdAt.toISOString(),
        expiresAt: link.expiresAt.toISOString(),
        ...(link.revokedAt && { revokedAt: link.revokedAt.toISOString() }),
        state: link.state,
        views: link.views,
        ...(link.lastViewedAt && { lastViewedAt: link.lastViewedAt.toISOString() }),
      })),
      ...(confirmation && {
        emailConfirmation: {
          ...(confirmation.email && { email: confirmation.email }),
          ...(confirmation.confirmedAt && { confirmedAt: iso(confirmation.confirmedAt) }),
          ...(confirmation.pendingEmail && { pendingEmail: confirmation.pendingEmail }),
        },
      }),
      ...((decision || history.length > 0) && {
        moderation: {
          state: decision?.state ?? 'pending',
          ...(decision?.reason && { reason: decision.reason }),
          ...(decision?.decidedAt && { decidedAt: iso(decision.decidedAt) }),
          history: history.map((entry) => ({
            action: entry.action,
            ...(entry.reason && { reason: entry.reason }),
            byYou: entry.actorDid === did,
            at: entry.at.toISOString(),
          })),
        },
      }),
    };
  }

  /**
   * Deletes everything held about an account except moderation decisions: private records
   * and files, share links, the email confirmation, and last its sessions (signing it out
   * everywhere). Safe to run again.
   */
  async erase(did: string): Promise<ErasureSummary> {
    if (!isValidDid(did)) throw new PrivateStoreError(`Invalid DID: ${did}`);
    const privateRecords = await this.records.deleteAll(did);
    const privateFiles = await this.files.deleteAll(did);
    const shareLinks = await this.shareLinks.deleteForAdopter(did);
    await this.confirmations.delete(did);
    const signedOut = await this.sessionStore.deleteAllForDid(did);
    return { privateRecords, privateFiles, shareLinks, sessions: signedOut };
  }
}
