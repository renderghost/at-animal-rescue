import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from './index';
import { indexOrgs, orgReviewLog, orgReviews } from './schema';

export type ReviewState = 'pending' | 'approved' | 'rejected' | 'revoked';
export type ReviewAction = 'approve' | 'reject' | 'revoke' | 'requestReview';

export interface OrgReview {
  state: ReviewState;
  /** Why it was rejected or revoked. */
  reason?: string;
  decidedAt?: Date;
  /** When it last asked for another review. */
  requestedAt?: Date;
}

export interface OrgUnderReview {
  did: string;
  handle?: string;
  displayName: string;
  locality: string;
  country: string;
  /** When its profile says it was created. */
  createdAt?: string;
  /** Published listings in the index, public or not. */
  listings: number;
  review: OrgReview;
}

export interface ReviewLogEntry {
  action: ReviewAction;
  reason?: string;
  actorDid: string;
  at: Date;
}

/** The review state, read the same way everywhere: no row is a first review. */
const STATE = sql<ReviewState>`CASE
  WHEN ${indexOrgs.trusted} THEN 'approved'
  WHEN ${orgReviews.state} IN ('rejected', 'revoked') THEN ${orgReviews.state}
  ELSE 'pending' END`;

/**
 * Moderators' decisions about organisations (#43). Approval makes everything an
 * organisation publishes public; rejecting or revoking keeps or takes it private, with a
 * reason it can see; it can then ask to be looked at again. Every step is logged.
 */
export class OrgReviewStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(did: string): Promise<OrgReview> {
    const [row] = await this.db
      .select({
        state: STATE,
        reason: orgReviews.reason,
        decidedAt: orgReviews.decidedAt,
        requestedAt: orgReviews.requestedAt,
      })
      .from(indexOrgs)
      .leftJoin(orgReviews, eq(orgReviews.did, indexOrgs.did))
      .where(eq(indexOrgs.did, did))
      .limit(1);
    return row ? this.review(row) : { state: 'pending' };
  }

  /** Every indexed organisation by state: those waiting, oldest request first. */
  async list(): Promise<Record<'pending' | 'approved' | 'notApproved', OrgUnderReview[]>> {
    const rows = await this.db
      .select({
        did: indexOrgs.did,
        handle: indexOrgs.handle,
        displayName: indexOrgs.displayName,
        locality: indexOrgs.locality,
        country: indexOrgs.country,
        createdAt: sql<string | null>`${indexOrgs.record}->>'createdAt'`,
        listings: sql<number>`(SELECT count(*)::int FROM index_listings l WHERE l.did = ${indexOrgs.did})`,
        state: STATE,
        reason: orgReviews.reason,
        decidedAt: orgReviews.decidedAt,
        requestedAt: orgReviews.requestedAt,
      })
      .from(indexOrgs)
      .leftJoin(orgReviews, eq(orgReviews.did, indexOrgs.did))
      .orderBy(
        asc(sql`coalesce(${orgReviews.requestedAt}, ${indexOrgs.indexedAt})`),
        asc(indexOrgs.did),
      );
    const orgs = rows.map((row) => ({
      did: row.did,
      ...(row.handle && { handle: row.handle }),
      displayName: row.displayName,
      locality: row.locality,
      country: row.country,
      ...(row.createdAt && { createdAt: row.createdAt }),
      listings: row.listings,
      review: this.review(row),
    }));
    return {
      pending: orgs.filter((org) => org.review.state === 'pending'),
      approved: orgs.filter((org) => org.review.state === 'approved'),
      notApproved: orgs.filter(
        (org) => org.review.state === 'rejected' || org.review.state === 'revoked',
      ),
    };
  }

  async approve(did: string, actorDid: string): Promise<void> {
    await this.decide(did, 'approved', 'approve', actorDid);
  }

  async reject(did: string, actorDid: string, reason: string): Promise<void> {
    await this.decide(did, 'rejected', 'reject', actorDid, reason);
  }

  async revoke(did: string, actorDid: string, reason: string): Promise<void> {
    await this.decide(did, 'revoked', 'revoke', actorDid, reason);
  }

  /** Back into the queue after a rejection or revocation. False when there's nothing to ask. */
  async requestReview(did: string): Promise<boolean> {
    const { state } = await this.get(did);
    if (state !== 'rejected' && state !== 'revoked') return false;
    const now = this.now();
    await this.db.transaction(async (tx) => {
      await tx
        .update(orgReviews)
        .set({ state: 'pending', requestedAt: now })
        .where(eq(orgReviews.did, did));
      await tx
        .insert(orgReviewLog)
        .values({ did, action: 'requestReview', actorDid: did, at: now });
    });
    return true;
  }

  /** What happened to an organisation, newest first. */
  async history(did: string): Promise<ReviewLogEntry[]> {
    const rows = await this.db
      .select()
      .from(orgReviewLog)
      .where(eq(orgReviewLog.did, did))
      .orderBy(desc(orgReviewLog.at), desc(orgReviewLog.id));
    return rows.map((row) => ({
      action: row.action as ReviewAction,
      ...(row.reason && { reason: row.reason }),
      actorDid: row.actorDid,
      at: row.at,
    }));
  }

  private async decide(
    did: string,
    state: ReviewState,
    action: ReviewAction,
    actorDid: string,
    reason?: string,
  ): Promise<void> {
    const now = this.now();
    const decision = { state, reason: reason ?? null, decidedBy: actorDid, decidedAt: now };
    await this.db.transaction(async (tx) => {
      await tx
        .update(indexOrgs)
        .set({ trusted: state === 'approved' })
        .where(eq(indexOrgs.did, did));
      await tx
        .insert(orgReviews)
        .values({ did, ...decision })
        .onConflictDoUpdate({ target: orgReviews.did, set: decision });
      await tx
        .insert(orgReviewLog)
        .values({ did, action, reason: reason ?? null, actorDid, at: now });
    });
  }

  private review(row: {
    state: ReviewState;
    reason: string | null;
    decidedAt: Date | null;
    requestedAt: Date | null;
  }): OrgReview {
    return {
      state: row.state,
      ...(row.reason &&
        row.state !== 'approved' &&
        row.state !== 'pending' && { reason: row.reason }),
      ...(row.decidedAt && { decidedAt: row.decidedAt }),
      ...(row.requestedAt && { requestedAt: row.requestedAt }),
    };
  }
}
