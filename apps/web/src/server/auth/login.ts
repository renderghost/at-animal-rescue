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
  | 'serverUnreachable';

export class LoginError extends Error {
  constructor(readonly code: LoginErrorCode) {
    super(code);
  }
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
  input: { identifier: string; password: string },
  deps: LoginDependencies,
): Promise<AppPasswordLogin> {
  let account;
  try {
    account = await resolveAccount(input.identifier, deps.resolver);
  } catch (err) {
    if (err instanceof IdentityError) throw new LoginError(err.code);
    throw new LoginError('serverUnreachable');
  }

  let pdsSession: PdsSession;
  try {
    pdsSession = await deps.createSession({
      service: account.pds,
      identifier: account.did,
      password: input.password,
    });
  } catch (err) {
    throw new LoginError(classifyLoginFailure(err));
  }

  const scope = sessionScope(pdsSession.session.accessJwt);
  if (scope !== 'appPass' && scope !== 'appPassPrivileged') {
    // Don't keep a full-access (or unrecognised) session alive on the PDS.
    await pdsSession.logout().catch(() => undefined);
    throw new LoginError('fullAccessPassword');
  }
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
