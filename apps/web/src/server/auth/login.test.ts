import { LexAuthFactorError } from '@atproto/lex-password-session';
import { describe, expect, it, vi } from 'vitest';
import type { IdentityResolver } from './identity';
import {
  loginWithAppPassword,
  type LoginDependencies,
  type PdsSession,
  type SignInLimiter,
} from './login';

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

  describe('with a sign-in limiter (#67)', () => {
    function limiter(blocked: { did?: string; ip?: string } = {}) {
      const events: string[] = [];
      const until = new Date('2026-10-24T10:15:00Z');
      const fake: SignInLimiter = {
        blockedUntil: async (key) =>
          (key.did && key.did === blocked.did) || (key.ip && key.ip === blocked.ip)
            ? until
            : undefined,
        failed: async (key) => void events.push(`failed ${key.did ?? '-'} ${key.ip ?? '-'}`),
        succeeded: async (account) => void events.push(`succeeded ${account}`),
      };
      return { fake, events, until };
    }
    const ip = '203.0.113.7';

    it('stops a blocked address before looking anything up', async () => {
      const { fake, until } = limiter({ ip });
      const resolveHandle = vi.fn(resolver.resolveHandle);
      const createSession = vi.fn();
      await expect(
        loginWithAppPassword(
          { ...input, ip },
          { resolver: { ...resolver, resolveHandle }, createSession, limiter: fake },
        ),
      ).rejects.toMatchObject({ code: 'tooManyAttempts', retryAfter: until });
      expect(resolveHandle).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    });

    it('stops a blocked account, by DID, before asking its PDS', async () => {
      const { fake } = limiter({ did });
      const createSession = vi.fn();
      await expect(
        loginWithAppPassword({ ...input, ip }, { ...deps(createSession), limiter: fake }),
      ).rejects.toMatchObject({ code: 'tooManyAttempts' });
      expect(createSession).not.toHaveBeenCalled();
    });

    it('counts wrong passwords against the account and address, and clears on success', async () => {
      const { fake, events } = limiter();
      const wrong = async () => {
        throw Object.assign(new Error('AuthenticationRequired'), {
          error: 'AuthenticationRequired',
        });
      };
      await expect(
        loginWithAppPassword({ ...input, ip }, { ...deps(wrong), limiter: fake }),
      ).rejects.toMatchObject({ code: 'invalidCredentials' });
      const { pdsSession } = session('com.atproto.appPass');
      await loginWithAppPassword(
        { ...input, ip },
        { ...deps(async () => pdsSession), limiter: fake },
      );
      expect(events).toEqual([`failed ${did} ${ip}`, `succeeded ${did}`]);
    });

    it('counts unknown handles against the address only, and outages not at all', async () => {
      const { fake, events } = limiter();
      await expect(
        loginWithAppPassword(
          { ...input, identifier: 'not a handle', ip },
          { ...deps(vi.fn()), limiter: fake },
        ),
      ).rejects.toMatchObject({ code: 'invalidIdentifier' });
      await expect(
        loginWithAppPassword(
          { ...input, ip },
          {
            ...deps(async () => {
              throw new Error('ECONNREFUSED');
            }),
            limiter: fake,
          },
        ),
      ).rejects.toMatchObject({ code: 'serverUnreachable' });
      expect(events).toEqual([`failed - ${ip}`]);
    });
  });
});
