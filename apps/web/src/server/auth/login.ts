import { LexAuthFactorError, type SessionData } from '@atproto/lex-password-session';
import { IdentityError, resolveAccount, type IdentityResolver } from './identity';
import { sessionScope } from './scope';

export type LoginErrorCode =
  | 'invalidIdentifier'
  | 'handleNotFound'
  | 'noPds'
  | 'invalidCredentials'
  | 'fullAccessPassword'
  | 'accountUnavailable'
  | 'serverUnreachable'
  | 'tooManyAttempts';

export class LoginError extends Error {
  constructor(
    readonly code: LoginErrorCode,
    /** With tooManyAttempts: when signing in can be tried again. */
    readonly retryAfter?: Date,
  ) {
    super(code);
  }
}

/** Limits failed sign-ins per account and per client address (#67). */
export interface SignInLimiter {
  blockedUntil(key: { did?: string; ip?: string }): Promise<Date | undefined>;
  failed(key: { did?: string; ip?: string }): Promise<void>;
  succeeded(did: string): Promise<void>;
}

/** A logged-in PDS session: just what login needs from PasswordSession. */
export interface PdsSession {
  readonly session: SessionData;
  logout(): Promise<void>;
}

export interface LoginDependencies {
  resolver: IdentityResolver;
  createSession(input: {
    service: string;
    identifier: string;
    password: string;
  }): Promise<PdsSession>;
  limiter?: SignInLimiter;
}

/**
 * Signs in with an app password. Full-access sessions (main account password) are
 * ended immediately and rejected: Homeward never holds full control of an account.
 * The password is passed straight to the PDS and never stored or logged.
 */
export interface AppPasswordLogin {
  /** Includes `service`: the account's PDS. */
  session: SessionData;
  /** Ends the session on the PDS. */
  logout(): Promise<void>;
}

export async function loginWithAppPassword(
  input: { identifier: string; password: string; ip?: string },
  deps: LoginDependencies,
): Promise<AppPasswordLogin> {
  const { limiter, resolver } = deps;
  const { ip } = input;
  const stopIfBlocked = async (key: { did?: string; ip?: string }) => {
    const until = await limiter?.blockedUntil(key);
    if (until) throw new LoginError('tooManyAttempts', until);
  };
  await stopIfBlocked({ ip });

  let account;
  try {
    account = await resolveAccount(input.identifier, resolver);
  } catch (err) {
    if (!(err instanceof IdentityError)) throw new LoginError('serverUnreachable');
    await limiter?.failed({ ip });
    throw new LoginError(err.code);
  }
  // Checked by DID, so a handle and its DID share one limit; before the PDS is asked.
  await stopIfBlocked({ did: account.did });

  let pdsSession: PdsSession;
  try {
    pdsSession = await deps.createSession({
      service: account.pds,
      identifier: account.did,
      password: input.password,
    });
  } catch (err) {
    const code = classifyLoginFailure(err);
    if (code === 'invalidCredentials') await limiter?.failed({ did: account.did, ip });
    throw new LoginError(code);
  }

  const scope = sessionScope(pdsSession.session.accessJwt);
  if (scope !== 'appPass' && scope !== 'appPassPrivileged') {
    // Don't keep a full-access (or unrecognised) session alive on the PDS.
    await pdsSession.logout().catch(() => undefined);
    throw new LoginError('fullAccessPassword');
  }
  await limiter?.succeeded(account.did);
  return {
    session: pdsSession.session,
    logout: () => pdsSession.logout(),
  };
}

function classifyLoginFailure(err: unknown): LoginErrorCode {
  // Two-factor prompts only happen with main account passwords; app passwords skip 2FA.
  if (err instanceof LexAuthFactorError) return 'fullAccessPassword';
  const code =
    typeof err === 'object' && err && 'error' in err
      ? (err as { error: unknown }).error
      : undefined;
  switch (code) {
    case 'AuthenticationRequired':
    case 'InvalidRequest':
      return 'invalidCredentials';
    case 'AccountTakedown':
    case 'AccountDeactivated':
      return 'accountUnavailable';
    default:
      return 'serverUnreachable';
  }
}
