import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Db } from './index';
import { indexListings, listingHides, listingModerationLog, listingReports } from './schema';

export type ReportState = 'open' | 'actioned' | 'dismissed';
export type ModerationAction =
  'reported' | 'hidden' | 'dismissed' | 'appealed' | 'reinstated' | 'upheld';

export interface ListingReport {
  id: string;
  reference: string;
  listingUri: string;
  orgDid: string;
  reason: string;
  explanation: string;
  reporterName?: string;
  reporterEmail?: string;
  createdAt: Date;
  state: ReportState;
  decidedAt?: Date;
  decisionNote?: string;
}

export interface ListingHide {
  listingUri: string;
  orgDid: string;
  category: string;
  ground: 'illegal' | 'terms';
  statement: string;
  decidedAt: Date;
  appealText?: string;
  appealedAt?: Date;
  appealDecidedAt?: Date;
  appealNote?: string;
}

export interface ModerationLogEntry {
  action: ModerationAction;
  reportId?: string;
  actorDid?: string;
  note?: string;
  at: Date;
}

/** How long a reporter's name and email are kept after the decision. */
export const REPORTER_CONTACT_MONTHS = 6;

/** Letters and digits that can't be mistaken for each other. */
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newReference(): string {
  const bytes = randomBytes(6);
  return `R-${[...bytes].map((b) => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('')}`;
}

const optional = <T>(value: T | null) => value ?? undefined;

/**
 * DSA notice and action for listings (#44): reports, hiding with a statement of reasons,
 * the organisation's second look, and the audit log of every step.
 */
export class ListingReportStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async report(input: {
    listingUri: string;
    orgDid: string;
    reason: string;
    explanation: string;
    reporterName?: string;
    reporterEmail?: string;
  }): Promise<ListingReport> {
    const id = randomUUID();
    const now = this.now();
    const [row] = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(listingReports)
        .values({
          id,
          reference: newReference(),
          listingUri: input.listingUri,
          orgDid: input.orgDid,
          reason: input.reason,
          explanation: input.explanation,
          reporterName: input.reporterName || null,
          reporterEmail: input.reporterEmail || null,
          createdAt: now,
        })
        .returning();
      await tx.insert(listingModerationLog).values({
        listingUri: input.listingUri,
        action: 'reported',
        reportId: id,
        note: input.reason,
        at: now,
      });
      return inserted;
    });
    return this.toReport(row!);
  }

  async get(id: string): Promise<ListingReport | undefined> {
    const [row] = await this.db.select().from(listingReports).where(eq(listingReports.id, id));
    return row && this.toReport(row);
  }

  /** How many reports gave this email address since a time (any case). */
  async countFromEmail(email: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(listingReports)
      .where(
        and(
          sql`lower(${listingReports.reporterEmail}) = lower(${email})`,
          gte(listingReports.createdAt, since),
        ),
      );
    return row?.count ?? 0;
  }

  /** Reports waiting for a decision, oldest first. */
  async open(): Promise<ListingReport[]> {
    const rows = await this.db
      .select()
      .from(listingReports)
      .where(eq(listingReports.state, 'open'))
      .orderBy(asc(listingReports.createdAt));
    return rows.map((row) => this.toReport(row));
  }

  /**
   * Hides a listing with a statement of reasons. Every open report about it is decided at
   * once; they are returned so their reporters can be told.
   */
  async hide(input: {
    listingUri: string;
    orgDid: string;
    category: string;
    ground: 'illegal' | 'terms';
    statement: string;
    actorDid: string;
  }): Promise<ListingReport[]> {
    const now = this.now();
    const decision = {
      orgDid: input.orgDid,
      category: input.category,
      ground: input.ground,
      statement: input.statement,
      decidedBy: input.actorDid,
      decidedAt: now,
      appealText: null,
      appealedAt: null,
      appealDecidedAt: null,
      appealNote: null,
    };
    return this.db.transaction(async (tx) => {
      await tx
        .insert(listingHides)
        .values({ listingUri: input.listingUri, ...decision })
        .onConflictDoUpdate({ target: listingHides.listingUri, set: decision });
      await tx
        .update(indexListings)
        .set({ moderation: 'hidden' })
        .where(eq(indexListings.uri, input.listingUri));
      const decided = await tx
        .update(listingReports)
        .set({
          state: 'actioned',
          decidedBy: input.actorDid,
          decidedAt: now,
          decisionNote: input.statement,
        })
        .where(
          and(eq(listingReports.listingUri, input.listingUri), eq(listingReports.state, 'open')),
        )
        .returning();
      await tx.insert(listingModerationLog).values({
        listingUri: input.listingUri,
        action: 'hidden',
        actorDid: input.actorDid,
        note: input.statement,
        at: now,
      });
      return decided.map((row) => this.toReport(row));
    });
  }

  /** No action on one report, with the reason the reporter is told. */
  async dismiss(id: string, actorDid: string, note: string): Promise<ListingReport | undefined> {
    const now = this.now();
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(listingReports)
        .set({ state: 'dismissed', decidedBy: actorDid, decidedAt: now, decisionNote: note })
        .where(and(eq(listingReports.id, id), eq(listingReports.state, 'open')))
        .returning();
      if (!row) return undefined;
      await tx.insert(listingModerationLog).values({
        listingUri: row.listingUri,
        action: 'dismissed',
        reportId: id,
        actorDid,
        note,
        at: now,
      });
      return this.toReport(row);
    });
  }

  async hideOf(listingUri: string): Promise<ListingHide | undefined> {
    const [row] = await this.db
      .select()
      .from(listingHides)
      .where(eq(listingHides.listingUri, listingUri));
    return row && this.toHide(row);
  }

  /** An organisation's hidden listings, for its dashboard. */
  async hidesOf(orgDid: string): Promise<ListingHide[]> {
    const rows = await this.db
      .select()
      .from(listingHides)
      .where(eq(listingHides.orgDid, orgDid))
      .orderBy(desc(listingHides.decidedAt));
    return rows.map((row) => this.toHide(row));
  }

  /** The organisation asks for a second look, once per decision. False if it can't. */
  async appeal(listingUri: string, orgDid: string, text: string): Promise<boolean> {
    const now = this.now();
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(listingHides)
        .set({ appealText: text, appealedAt: now })
        .where(
          and(
            eq(listingHides.listingUri, listingUri),
            eq(listingHides.orgDid, orgDid),
            isNull(listingHides.appealedAt),
          ),
        )
        .returning({ uri: listingHides.listingUri });
      if (updated.length === 0) return false;
      await tx.insert(listingModerationLog).values({
        listingUri,
        action: 'appealed',
        actorDid: orgDid,
        note: text,
        at: now,
      });
      return true;
    });
  }

  /** Second looks waiting for a moderator, oldest first. */
  async openAppeals(): Promise<ListingHide[]> {
    const rows = await this.db
      .select()
      .from(listingHides)
      .where(and(isNotNull(listingHides.appealedAt), isNull(listingHides.appealDecidedAt)))
      .orderBy(asc(listingHides.appealedAt));
    return rows.map((row) => this.toHide(row));
  }

  /** The second look succeeds: the listing is public again. */
  async reinstate(listingUri: string, actorDid: string, note?: string): Promise<boolean> {
    const now = this.now();
    return this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(listingHides)
        .where(eq(listingHides.listingUri, listingUri))
        .returning({ uri: listingHides.listingUri });
      if (deleted.length === 0) return false;
      await tx
        .update(indexListings)
        .set({ moderation: 'visible' })
        .where(eq(indexListings.uri, listingUri));
      await tx.insert(listingModerationLog).values({
        listingUri,
        action: 'reinstated',
        actorDid,
        note: note || null,
        at: now,
      });
      return true;
    });
  }

  /** The second look upholds the decision, with the reason the organisation is told. */
  async uphold(listingUri: string, actorDid: string, note: string): Promise<boolean> {
    const now = this.now();
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(listingHides)
        .set({ appealDecidedAt: now, appealNote: note })
        .where(and(eq(listingHides.listingUri, listingUri), isNotNull(listingHides.appealedAt)))
        .returning({ uri: listingHides.listingUri });
      if (updated.length === 0) return false;
      await tx
        .insert(listingModerationLog)
        .values({ listingUri, action: 'upheld', actorDid, note, at: now });
      return true;
    });
  }

  /** What happened to a listing, newest first. */
  async history(listingUri: string): Promise<ModerationLogEntry[]> {
    const rows = await this.db
      .select()
      .from(listingModerationLog)
      .where(eq(listingModerationLog.listingUri, listingUri))
      .orderBy(desc(listingModerationLog.at), desc(listingModerationLog.id));
    return rows.map((row) => ({
      action: row.action as ModerationAction,
      ...(row.reportId && { reportId: row.reportId }),
      ...(row.actorDid && { actorDid: row.actorDid }),
      ...(row.note && { note: row.note }),
      at: row.at,
    }));
  }

  /** Erases reporters' names and emails six months after the decision. Returns how many. */
  async eraseExpiredContacts(): Promise<number> {
    const now = this.now();
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - REPORTER_CONTACT_MONTHS);
    const erased = await this.db
      .update(listingReports)
      .set({ reporterName: null, reporterEmail: null, contactErasedAt: now })
      .where(
        and(
          lt(listingReports.decidedAt, cutoff),
          isNull(listingReports.contactErasedAt),
          sql`(${listingReports.reporterName} IS NOT NULL OR ${listingReports.reporterEmail} IS NOT NULL)`,
        ),
      )
      .returning({ id: listingReports.id });
    return erased.length;
  }

  private toReport(row: typeof listingReports.$inferSelect): ListingReport {
    return {
      id: row.id,
      reference: row.reference,
      listingUri: row.listingUri,
      orgDid: row.orgDid,
      reason: row.reason,
      explanation: row.explanation,
      ...(row.reporterName && { reporterName: row.reporterName }),
      ...(row.reporterEmail && { reporterEmail: row.reporterEmail }),
      createdAt: row.createdAt,
      state: row.state as ReportState,
      ...(row.decidedAt && { decidedAt: row.decidedAt }),
      ...(row.decisionNote && { decisionNote: row.decisionNote }),
    };
  }

  private toHide(row: typeof listingHides.$inferSelect): ListingHide {
    return {
      listingUri: row.listingUri,
      orgDid: row.orgDid,
      category: row.category,
      ground: row.ground as ListingHide['ground'],
      statement: row.statement,
      decidedAt: row.decidedAt,
      appealText: optional(row.appealText),
      appealedAt: optional(row.appealedAt),
      appealDecidedAt: optional(row.appealDecidedAt),
      appealNote: optional(row.appealNote),
    };
  }
}
