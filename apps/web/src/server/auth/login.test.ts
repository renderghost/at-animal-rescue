import { LexAuthFactorError } from '@atproto/lex-password-session';
import { describe, expect, it, vi } from 'vitest';
import type { IdentityResolver } from './identity';
import { loginWithAppPassword, type LoginDependencies, type PdsSession } from './login';

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz';
const resolver: IdentityResolver = {
  resolveHandle: async () => did,
  resolveDid: async () => ({ handle: 'rescue.example.org', pds: 'https://pds.example.org' }),
};

function jwt(scope: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256K' })}.${encode({ scope, sub: did })}.signature`;
}

function session(scope: string) {
  const logout = vi.fn(async () => undefined);
  const pdsSession: PdsSession = {
    session: {
      accessJwt: jwt(scope),
      refreshJwt: 'refresh',
      did,
      handle: 'rescue.example.org',
      service: 'https://pds.example.org',
    },
    logout,
  };
  return { pdsSession, logout };
}

function deps(createSession: LoginDependencies['createSession']): LoginDependencies {
  return { resolver, createSession };
}

const input = { identifier: 'rescue.example.org', password: 'abcd-efgh-ijkl-mnop' };

describe('loginWithAppPassword', () => {
  it('accepts an app-password session and calls the account’s own PDS by DID', async () => {
    const { pdsSession } = session('com.atproto.appPass');
    const createSession = vi.fn(async () => pdsSession);
    const result = await loginWithAppPassword(input, deps(createSession));
    expect(result.session).toMatchObject({ did, service: 'https://pds.example.org' });
    expect(createSession).toHaveBeenCalledWith({
      service: 'https://pds.example.org',
      identifier: did,
      password: input.password,
    });
  });

  it('accepts privileged app passwords', async () => {
    const { pdsSession } = session('com.atproto.appPassPrivileged');
    await expect(
      loginWithAppPassword(
        input,
        deps(async () => pdsSession),
      ),
    ).resolves.toBeDefined();
  });

  it.each(['com.atproto.access', 'something.new'])(
    'ends and rejects a session with scope %s',
    async (scope) => {
      const { pdsSession, logout } = session(scope);
      await expect(
        loginWithAppPassword(
          input,
          deps(async () => pdsSession),
        ),
      ).rejects.toMatchObject({ code: 'fullAccessPassword' });
      expect(logout).toHaveBeenCalledOnce();
    },
  );

  it('treats a two-factor prompt as a main-password attempt', async () => {
    const twoFactor = Object.create(LexAuthFactorError.prototype) as LexAuthFactorError;
    await expect(
      loginWithAppPassword(
        input,
        deps(async () => {
          throw twoFactor;
        }),
      ),
    ).rejects.toMatchObject({ code: 'fullAccessPassword' });
  });

  it.each([
    ['AuthenticationRequired', 'invalidCredentials'],
    ['AccountTakedown', 'accountUnavailable'],
    ['InternalServerError', 'serverUnreachable'],
  ])('maps PDS error %s to %s', async (error, code) => {
    await expect(
      loginWithAppPassword(
        input,
        deps(async () => {
          throw Object.assign(new Error(error), { error });
        }),
      ),
    ).rejects.toMatchObject({ code });
  });

  it('maps identity failures without contacting any PDS', async () => {
    const createSession = vi.fn();
    await expect(
      loginWithAppPassword({ ...input, identifier: 'not a handle' }, deps(createSession)),
    ).rejects.toMatchObject({ code: 'invalidIdentifier' });
    expect(createSession).not.toHaveBeenCalled();
  });
});
