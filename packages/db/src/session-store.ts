import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt, or } from 'drizzle-orm';
import { open, seal, type Keyring } from './crypto';
import type { Db } from './index';
import { sessions } from './schema';

/** Absolute lifetime: sign in again after this, however active. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
/** Idle timeout: sessions unused for this long end. */
export const SESSION_IDLE_SECONDS = 60 * 60 * 24 * 14;
/** Avoid a write on every request: refresh last-seen at most this often. */
const TOUCH_INTERVAL_SECONDS = 60 * 5;

export interface StoredSession<T> {
  did: string;
  handle: string;
  data: T;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function aad(tokenHash: string): string {
  return `session\n${tokenHash}`;
}

/**
 * Server-side sessions with opaque tokens. `T` is whatever the caller needs to keep
 * secret (for Homeward, the PDS session data).
 */
export class SessionStore<T> {
  constructor(
    private readonly db: Db,
    private readonly keyring: Keyring,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Stores a new session and returns the token for the cookie. */
  async create(session: StoredSession<T>): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const sealed = this.seal(tokenHash, session.data);
    await this.db.insert(sessions).values({
      tokenHash,
      did: session.did,
      handle: session.handle,
      keyId: sealed.keyId,
      iv: sealed.iv,
      ciphertext: sealed.data,
      createdAt: this.now(),
      lastSeenAt: this.now(),
      expiresAt: new Date(this.now().getTime() + SESSION_MAX_AGE_SECONDS * 1000),
    });
    return token;
  }

  /** The live session for a token, or undefined if unknown, expired or idle too long. */
  async get(token: string): Promise<StoredSession<T> | undefined> {
    const tokenHash = hashToken(token);
    const now = this.now();
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          gt(sessions.expiresAt, now),
          gt(sessions.lastSeenAt, new Date(now.getTime() - SESSION_IDLE_SECONDS * 1000)),
        ),
      )
      .limit(1);
    if (!row) return undefined;

    let data: T;
    try {
      data = JSON.parse(
        open(
          this.keyring,
          { keyId: row.keyId, iv: row.iv, data: row.ciphertext },
          aad(tokenHash),
        ).toString('utf8'),
      ) as T;
    } catch {
      // Undecryptable (e.g. key removed): treat as signed out.
      await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
      return undefined;
    }

    if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_SECONDS * 1000) {
      await this.db
        .update(sessions)
        .set({ lastSeenAt: now })
        .where(eq(sessions.tokenHash, tokenHash));
    }
    return { did: row.did, handle: row.handle, data };
  }

  /** Replaces the secret data, e.g. after the PDS rotates tokens. */
  async update(token: string, data: T): Promise<void> {
    const tokenHash = hashToken(token);
    const sealed = this.seal(tokenHash, data);
    await this.db
      .update(sessions)
      .set({ keyId: sealed.keyId, iv: sealed.iv, ciphertext: sealed.data })
      .where(eq(sessions.tokenHash, tokenHash));
  }

  async delete(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  /** Ends every session for an account (sign out everywhere, GDPR erasure). */
  async deleteAllForDid(did: string): Promise<number> {
    const deleted = await this.db
      .delete(sessions)
      .where(eq(sessions.did, did))
      .returning({ did: sessions.did });
    return deleted.length;
  }

  /** Removes expired and idle sessions. Safe to run on a schedule. */
  async purgeExpired(): Promise<number> {
    const now = this.now();
    const deleted = await this.db
      .delete(sessions)
      .where(
        or(
          lt(sessions.expiresAt, now),
          lt(sessions.lastSeenAt, new Date(now.getTime() - SESSION_IDLE_SECONDS * 1000)),
        ),
      )
      .returning({ did: sessions.did });
    return deleted.length;
  }

  private seal(tokenHash: string, data: T) {
    return seal(this.keyring, Buffer.from(JSON.stringify(data), 'utf8'), aad(tokenHash));
  }
}
