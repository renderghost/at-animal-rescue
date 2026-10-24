import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from './index';
import { shareLinks, shareLinkViews } from './schema';

/** How long a link can last, in days; 30 unless the adopter chooses otherwise. */
export const SHARE_LINK_DAYS = [7, 30, 90] as const;
export const DEFAULT_SHARE_LINK_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export type ShareLinkState = 'active' | 'expired' | 'revoked';

export interface ShareLink {
  id: string;
  adopterDid: string;
  adopterHandle: string;
  orgDid: string;
  listingUri: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  state: ShareLinkState;
}

export interface ShareLinkWithViews extends ShareLink {
  views: number;
  lastViewedAt?: Date;
}

/** Only this is stored, so a copy of the database can't open anyone's link. */
const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Links that let one organisation read an adopter's answers for one listing (#42). The
 * secret is 256 random bits, given to the adopter once and never stored.
 */
export class ShareLinkStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(link: {
    adopterDid: string;
    adopterHandle: string;
    orgDid: string;
    listingUri: string;
    days: number;
  }): Promise<{ id: string; token: string; expiresAt: Date }> {
    const days = (SHARE_LINK_DAYS as readonly number[]).includes(link.days)
      ? link.days
      : DEFAULT_SHARE_LINK_DAYS;
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const expiresAt = new Date(this.now().getTime() + days * DAY);
    await this.db.insert(shareLinks).values({
      id,
      tokenHash: hashOf(token),
      adopterDid: link.adopterDid,
      adopterHandle: link.adopterHandle,
      orgDid: link.orgDid,
      listingUri: link.listingUri,
      createdAt: this.now(),
      expiresAt,
    });
    return { id, token, expiresAt };
  }

  /** The link a secret opens, whatever its state; undefined when there's no such link. */
  async find(token: string): Promise<ShareLink | undefined> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const [row] = await this.db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.tokenHash, hashOf(token)))
      .limit(1);
    return row && this.toLink(row);
  }

  async recordView(id: string): Promise<void> {
    await this.db.insert(shareLinkViews).values({ linkId: id, viewedAt: this.now() });
  }

  /** An adopter's links, newest first, with how often and when each was last opened. */
  async listForAdopter(adopterDid: string): Promise<ShareLinkWithViews[]> {
    const rows = await this.db
      .select({
        link: shareLinks,
        views: sql<number>`count(${shareLinkViews.viewedAt})::int`,
        lastViewedAt: sql<Date | null>`max(${shareLinkViews.viewedAt})`,
      })
      .from(shareLinks)
      .leftJoin(shareLinkViews, eq(shareLinkViews.linkId, shareLinks.id))
      .where(eq(shareLinks.adopterDid, adopterDid))
      .groupBy(shareLinks.id)
      .orderBy(desc(shareLinks.createdAt));
    return rows.map(({ link, views, lastViewedAt }) => ({
      ...this.toLink(link),
      views,
      ...(lastViewedAt && { lastViewedAt: new Date(lastViewedAt) }),
    }));
  }

  /** Stops a link working at once. Only its adopter can. */
  async revoke(adopterDid: string, id: string): Promise<boolean> {
    const updated = await this.db
      .update(shareLinks)
      .set({ revokedAt: this.now() })
      .where(
        and(
          eq(shareLinks.id, id),
          eq(shareLinks.adopterDid, adopterDid),
          isNull(shareLinks.revokedAt),
        ),
      )
      .returning({ id: shareLinks.id });
    return updated.length > 0;
  }

  /** Every link and view log for an adopter (GDPR erasure, #46). */
  async deleteForAdopter(adopterDid: string): Promise<number> {
    const ids = this.db
      .select({ id: shareLinks.id })
      .from(shareLinks)
      .where(eq(shareLinks.adopterDid, adopterDid));
    await this.db.delete(shareLinkViews).where(inArray(shareLinkViews.linkId, ids));
    const deleted = await this.db
      .delete(shareLinks)
      .where(eq(shareLinks.adopterDid, adopterDid))
      .returning({ id: shareLinks.id });
    return deleted.length;
  }

  private toLink(row: typeof shareLinks.$inferSelect): ShareLink {
    const state: ShareLinkState = row.revokedAt
      ? 'revoked'
      : row.expiresAt <= this.now()
        ? 'expired'
        : 'active';
    return {
      id: row.id,
      adopterDid: row.adopterDid,
      adopterHandle: row.adopterHandle,
      orgDid: row.orgDid,
      listingUri: row.listingUri,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      ...(row.revokedAt && { revokedAt: row.revokedAt }),
      state,
    };
  }
}
