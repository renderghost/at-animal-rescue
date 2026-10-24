import { createHmac } from 'node:crypto';
import { and, asc, eq, gt, lt } from 'drizzle-orm';
import type { Keyring } from './crypto';
import type { Db } from './index';
import { signInFailures } from './schema';

/** How long a failed sign-in counts against an account or address (#67). */
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
/** Failed sign-ins allowed in the window, per account and per client address. */
export const SIGN_IN_LIMITS = { did: 10, ip: 30 } as const;

export interface SignInKey {
  did?: string;
  ip?: string;
}

/**
 * Counts failed sign-ins so Homeward can't be used to guess app passwords against other
 * people's PDSes, and so one abuser can't get a PDS to block everyone signing in from here.
 * Accounts and addresses are stored only as keyed hashes, and only for the window.
 */
export class SignInFailureStore {
  constructor(
    private readonly db: Db,
    private readonly keyring: Keyring,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** When the account or address may try again, if either is over its limit now. */
  async blockedUntil(key: SignInKey): Promise<Date | undefined> {
    const since = new Date(this.now().getTime() - SIGN_IN_WINDOW_MS);
    let until: Date | undefined;
    for (const [kind, bucket] of this.buckets(key)) {
      const rows = await this.db
        .select({ at: signInFailures.at })
        .from(signInFailures)
        .where(and(eq(signInFailures.bucket, bucket), gt(signInFailures.at, since)))
        .orderBy(asc(signInFailures.at));
      const limit = SIGN_IN_LIMITS[kind];
      if (rows.length < limit) continue;
      // Free again once enough of the failures have aged out of the window.
      const freed = new Date(rows[rows.length - limit]!.at.getTime() + SIGN_IN_WINDOW_MS);
      if (!until || freed > until) until = freed;
    }
    return until;
  }

  async failed(key: SignInKey): Promise<void> {
    const at = this.now();
    const buckets = this.buckets(key).map(([, bucket]) => ({ bucket, at }));
    if (buckets.length > 0) await this.db.insert(signInFailures).values(buckets);
    // Nothing is kept past the window.
    await this.db
      .delete(signInFailures)
      .where(lt(signInFailures.at, new Date(at.getTime() - SIGN_IN_WINDOW_MS)));
  }

  /** A successful sign-in clears the account's failures (not the address's). */
  async succeeded(did: string): Promise<void> {
    await this.db.delete(signInFailures).where(eq(signInFailures.bucket, this.bucket('did', did)));
  }

  private buckets(key: SignInKey): Array<['did' | 'ip', string]> {
    return [
      ...(key.did ? [['did', this.bucket('did', key.did)] as ['did', string]] : []),
      ...(key.ip ? [['ip', this.bucket('ip', key.ip)] as ['ip', string]] : []),
    ];
  }

  /** Keyed, so a leaked table can't be matched against addresses or accounts offline. */
  private bucket(kind: 'did' | 'ip', value: string): string {
    const secret = this.keyring.keys.get(this.keyring.activeKeyId)!;
    const hash = createHmac('sha256', secret).update(`sign-in\n${kind}\n${value}`).digest('hex');
    return `${kind}:${hash}`;
  }
}
