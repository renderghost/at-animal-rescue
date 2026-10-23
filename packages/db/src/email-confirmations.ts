import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Keyring } from './crypto';
import type { Db } from './index';
import { emailConfirmations } from './schema';

export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_SENDS_PER_HOUR = 3;
export const MAX_ATTEMPTS = 5;
const HOUR = 60 * 60 * 1000;

export interface EmailConfirmation {
  email: string;
  confirmedAt: Date;
}

export type StartResult = { ok: true; code: string } | { ok: false; retryAfter: Date };
export type ConfirmResult = 'confirmed' | 'wrong' | 'expired' | 'tooManyAttempts' | 'noCode';

const normalise = (email: string) => email.trim().toLowerCase();

/**
 * One-time codes that confirm an organisation's contact email (#30). Codes are six digits,
 * last 15 minutes and allow a few attempts; sends are limited per hour. Only a keyed hash of
 * each code is stored.
 */
export class EmailConfirmationStore {
  constructor(
    private readonly db: Db,
    private readonly keyring: Keyring,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The last confirmed address, if any. Whether it still counts is up to the caller. */
  async get(did: string): Promise<EmailConfirmation | undefined> {
    const [row] = await this.db
      .select({ email: emailConfirmations.email, confirmedAt: emailConfirmations.confirmedAt })
      .from(emailConfirmations)
      .where(eq(emailConfirmations.did, did))
      .limit(1);
    return row?.email && row.confirmedAt
      ? { email: row.email, confirmedAt: row.confirmedAt }
      : undefined;
  }

  /** Whether a code for this address is waiting to be entered. */
  async pending(did: string, email: string): Promise<boolean> {
    const row = await this.row(did);
    return Boolean(
      row?.codeHash &&
      row.pendingEmail === normalise(email) &&
      row.codeExpiresAt &&
      row.codeExpiresAt > this.now(),
    );
  }

  /** A new code for the address, replacing any earlier one, unless the hourly limit is reached. */
  async start(did: string, email: string): Promise<StartResult> {
    const now = this.now();
    const row = await this.row(did);
    const windowStart = row?.sendWindowStartedAt;
    const inWindow = windowStart && now.getTime() - windowStart.getTime() < HOUR;
    const sends = inWindow ? (row?.sendsInWindow ?? 0) : 0;
    if (sends >= MAX_SENDS_PER_HOUR) {
      return { ok: false, retryAfter: new Date(windowStart!.getTime() + HOUR) };
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const values = {
      pendingEmail: normalise(email),
      codeHash: this.hash(did, email, code),
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      sendWindowStartedAt: inWindow ? windowStart : now,
      sendsInWindow: sends + 1,
    };
    await this.db
      .insert(emailConfirmations)
      .values({ did, ...values })
      .onConflictDoUpdate({ target: emailConfirmations.did, set: values });
    return { ok: true, code };
  }

  /** Checks a code for the address. A code works once; too many wrong tries cancel it. */
  async confirm(did: string, email: string, code: string): Promise<ConfirmResult> {
    const now = this.now();
    const row = await this.row(did);
    if (!row?.codeHash || row.pendingEmail !== normalise(email) || !row.codeExpiresAt) {
      return 'noCode';
    }
    if (row.codeExpiresAt <= now) return 'expired';
    if (row.attempts >= MAX_ATTEMPTS) return 'tooManyAttempts';

    const expected = Buffer.from(row.codeHash, 'hex');
    const given = Buffer.from(this.hash(did, email, code.replace(/\s/g, '')), 'hex');
    if (!timingSafeEqual(expected, given)) {
      const attempts = row.attempts + 1;
      await this.db
        .update(emailConfirmations)
        .set({ attempts })
        .where(eq(emailConfirmations.did, did));
      return attempts >= MAX_ATTEMPTS ? 'tooManyAttempts' : 'wrong';
    }
    await this.db
      .update(emailConfirmations)
      .set({
        email: normalise(email),
        confirmedAt: now,
        pendingEmail: null,
        codeHash: null,
        codeExpiresAt: null,
        attempts: 0,
      })
      .where(eq(emailConfirmations.did, did));
    return 'confirmed';
  }

  async delete(did: string): Promise<void> {
    await this.db.delete(emailConfirmations).where(eq(emailConfirmations.did, did));
  }

  private async row(did: string) {
    const [row] = await this.db
      .select()
      .from(emailConfirmations)
      .where(eq(emailConfirmations.did, did))
      .limit(1);
    return row;
  }

  /** Keyed, so a leaked table can't be brute-forced through a million codes offline. */
  private hash(did: string, email: string, code: string): string {
    const key = this.keyring.keys.get(this.keyring.activeKeyId)!;
    return createHmac('sha256', key)
      .update(`email-confirmation\n${did}\n${normalise(email)}\n${code}`)
      .digest('hex');
  }
}

/** How long a confirmation counts (spec §2). */
export const CONFIRMATION_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

/** A confirmation counts for the current contact email, for a year (spec §2). */
export function confirmationHolds(
  confirmation: EmailConfirmation | undefined,
  currentEmail: string | undefined,
  now: Date = new Date(),
): confirmation is EmailConfirmation {
  return Boolean(
    confirmation &&
    currentEmail &&
    confirmation.email === normalise(currentEmail) &&
    now.getTime() - confirmation.confirmedAt.getTime() < CONFIRMATION_LIFETIME_MS,
  );
}
