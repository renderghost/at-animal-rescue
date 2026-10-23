import type { DomainFact, VerificationFact } from '@homeward/db';
import { describe, expect, it, vi } from 'vitest';
import {
  checkDomain,
  checkVerifications,
  createExtraRecordsLoader,
  FactChecker,
  isProviderHandle,
  type HandleLookups,
} from './facts';

const did = 'did:plc:hillfarm';
const log = { info: vi.fn(), warn: vi.fn() };

describe('isProviderHandle', () => {
  it('matches handles under a hosting provider, not look-alikes', () => {
    const suffixes = ['bsky.social', 'eurosky.social'];
    expect(isProviderHandle('hillfarm.bsky.social', suffixes)).toBe(true);
    expect(isProviderHandle('Hillfarm.EUROSKY.social', suffixes)).toBe(true);
    expect(isProviderHandle('hillfarm.org', suffixes)).toBe(false);
    expect(isProviderHandle('notbsky.social', suffixes)).toBe(false);
  });
});

describe('checkDomain', () => {
  const lookups = (fields: Partial<HandleLookups>): HandleLookups => ({
    verifiedHandle: async () => 'hillfarm.org',
    resolveDns: async () => undefined,
    resolveHttp: async () => undefined,
    ...fields,
  });

  it('says how the domain points back to the account', async () => {
    expect(await checkDomain(did, lookups({ resolveDns: async () => did }), [])).toEqual({
      handle: 'hillfarm.org',
      method: 'dns',
    });
    expect(await checkDomain(did, lookups({ resolveHttp: async () => did }), [])).toEqual({
      handle: 'hillfarm.org',
      method: 'https',
    });
  });

  it('has nothing to show for provider handles, unverified handles or other accounts', async () => {
    const dns = async () => did;
    expect(
      await checkDomain(
        did,
        lookups({ verifiedHandle: async () => 'hillfarm.bsky.social', resolveDns: dns }),
        ['bsky.social'],
      ),
    ).toBeUndefined();
    expect(
      await checkDomain(
        did,
        lookups({ verifiedHandle: async () => undefined, resolveDns: dns }),
        [],
      ),
    ).toBeUndefined();
    expect(
      await checkDomain(did, lookups({ resolveDns: async () => 'did:plc:someone-else' }), []),
    ).toBeUndefined();
  });
});

describe('checkVerifications', () => {
  const issuer = 'did:plc:bluesky';
  function appview(routes: Record<string, unknown>) {
    return vi.fn(async (url: URL | string) => {
      const { pathname } = new URL(String(url));
      const body = routes[pathname.replace('/xrpc/', '')];
      if (typeof body === 'number') return new Response('{}', { status: body });
      return Response.json(body ?? {});
    }) as unknown as typeof globalThis.fetch;
  }
  const profile = (verifications: unknown[]) => ({
    did,
    handle: 'hillfarm.org',
    displayName: 'Hill Farm',
    verification: { verifications },
  });

  it('keeps valid verifications by trusted verifiers, with who issued them', async () => {
    const fetch = appview({
      'app.bsky.actor.getProfile': profile([
        { issuer, isValid: true, createdAt: '2026-05-01T00:00:00Z' },
        { issuer: 'did:plc:stale', isValid: false, createdAt: '2026-01-01T00:00:00Z' },
      ]),
      'app.bsky.actor.getProfiles': {
        profiles: [{ did: issuer, handle: 'bsky.app', displayName: 'Bluesky' }],
      },
    });
    expect(
      await checkVerifications(did, {
        appviewUrl: 'https://appview.test',
        extraVerifiers: [],
        fetch,
      }),
    ).toEqual([
      {
        issuer,
        issuerHandle: 'bsky.app',
        issuerName: 'Bluesky',
        createdAt: '2026-05-01T00:00:00Z',
      },
    ]);
  });

  it('checks extra verifiers against the current handle and display name', async () => {
    const eu = 'did:plc:eu-registry';
    const fetch = appview({
      'app.bsky.actor.getProfile': profile([]),
      'app.bsky.actor.getProfiles': { profiles: [{ did: eu, handle: 'registry.eu' }] },
    });
    const records = (displayName: string) => async () =>
      new Map([[did, [{ subject: did, handle: 'hillfarm.org', displayName, createdAt: 'x' }]]]);
    const sources = { appviewUrl: 'https://appview.test', extraVerifiers: [eu], fetch };
    expect(
      await checkVerifications(did, { ...sources, extraRecords: records('Hill Farm') }),
    ).toEqual([{ issuer: eu, issuerHandle: 'registry.eu', createdAt: 'x' }]);
    // Renamed since it was verified: no longer valid.
    expect(
      await checkVerifications(did, { ...sources, extraRecords: records('Old name') }),
    ).toEqual([]);
  });

  it('shows nothing for an account without a Bluesky profile, and fails loudly on outages', async () => {
    const sources = { appviewUrl: 'https://appview.test', extraVerifiers: [] };
    expect(
      await checkVerifications(did, {
        ...sources,
        fetch: appview({ 'app.bsky.actor.getProfile': 400 }),
      }),
    ).toEqual([]);
    await expect(
      checkVerifications(did, { ...sources, fetch: appview({ 'app.bsky.actor.getProfile': 503 }) }),
    ).rejects.toThrow('503');
  });
});

describe('createExtraRecordsLoader', () => {
  it('pages through a verifier’s records once and caches them', async () => {
    const pages = [
      {
        records: [
          {
            value: {
              subject: did,
              handle: 'hillfarm.org',
              displayName: 'Hill Farm',
              createdAt: 'a',
            },
          },
        ],
        cursor: 'next',
      },
      {
        records: [
          { value: { subject: 'did:plc:other', handle: 'x', displayName: '', createdAt: 'b' } },
        ],
      },
    ];
    const fetch = vi.fn(async () =>
      Response.json(pages.shift()),
    ) as unknown as typeof globalThis.fetch;
    const load = createExtraRecordsLoader({ pdsOf: async () => 'https://pds.test', fetch });
    const records = await load('did:plc:eu');
    expect(records.get(did)).toHaveLength(1);
    expect(records.get('did:plc:other')).toHaveLength(1);
    await load('did:plc:eu');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('FactChecker', () => {
  function setup(fields: Partial<ConstructorParameters<typeof FactChecker>[0]> = {}) {
    const saved: Array<[string, string, unknown]> = [];
    const store = {
      saveDomain: vi.fn(async (d: string, fact: DomainFact | undefined) => {
        saved.push(['domain', d, fact]);
      }),
      saveVerifications: vi.fn(async (d: string, list: VerificationFact[]) => {
        saved.push(['verifications', d, list]);
      }),
      due: vi.fn(async () => ['did:plc:a', 'did:plc:b']),
    };
    const checker = new FactChecker({
      store,
      domain: async () => ({ handle: 'hillfarm.org', method: 'dns' }),
      verifications: async () => [],
      log,
      ...fields,
    });
    return { checker, store, saved };
  }

  it('keeps the previous result for a check that fails, and saves the other', async () => {
    const { checker, saved } = setup({
      verifications: async () => {
        throw new Error('AppView down');
      },
    });
    await checker.check(did);
    expect(saved).toEqual([['domain', did, { handle: 'hillfarm.org', method: 'dns' }]]);
    expect(log.warn).toHaveBeenCalledWith(
      'verification check failed; keeping the previous result',
      expect.objectContaining({ did }),
    );
  });

  it('queues requests without blocking, each waiting organisation once', async () => {
    const { checker, store } = setup();
    checker.request('did:plc:a'); // starts straight away
    checker.request('did:plc:b');
    checker.request('did:plc:b'); // already waiting
    // A change during a check is checked again afterwards, as the result may differ.
    checker.request('did:plc:a');
    await checker.idle();
    expect(store.saveDomain.mock.calls.map(([d]) => d)).toEqual([
      'did:plc:a',
      'did:plc:b',
      'did:plc:a',
    ]);
  });

  it('re-checks organisations whose facts are older than a day', async () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const { checker, store } = setup({ now: () => now });
    expect(await checker.checkDue()).toBe(2);
    expect(store.due).toHaveBeenCalledWith(new Date('2026-10-22T12:00:00Z'), 100);
    expect(store.saveDomain.mock.calls.map(([d]) => d)).toEqual(['did:plc:a', 'did:plc:b']);
  });
});
