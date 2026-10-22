import { describe, expect, it } from 'vitest';
import { parseIdentifier, resolveAccount, type IdentityResolver } from './identity';

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz';

function resolver(overrides: Partial<IdentityResolver> = {}): IdentityResolver {
  return {
    resolveHandle: async (handle) => (handle === 'alex.eurosky.social' ? did : undefined),
    resolveDid: async () => ({ handle: 'alex.eurosky.social', pds: 'https://pds.eurosky.social' }),
    ...overrides,
  };
}

describe('parseIdentifier', () => {
  it('normalises handles', () => {
    expect(parseIdentifier('  @Alex.Eurosky.Social ')).toEqual({
      kind: 'handle',
      value: 'alex.eurosky.social',
    });
  });

  it('accepts DIDs', () => {
    expect(parseIdentifier(did)).toEqual({ kind: 'did', value: did });
  });

  it('rejects emails, bare names and IP addresses', () => {
    expect(parseIdentifier('alex@example.com').kind).toBe('invalid');
    expect(parseIdentifier('alex').kind).toBe('invalid');
    expect(parseIdentifier('127.0.0.1').kind).toBe('invalid');
  });
});

describe('resolveAccount', () => {
  it('resolves a handle to its DID and PDS', async () => {
    await expect(resolveAccount('alex.eurosky.social', resolver())).resolves.toEqual({
      did,
      handle: 'alex.eurosky.social',
      pds: 'https://pds.eurosky.social',
    });
  });

  it('rejects a handle the DID document does not claim back', async () => {
    const r = resolver({
      resolveDid: async () => ({ handle: 'someone-else.example', pds: 'https://pds.example' }),
    });
    await expect(resolveAccount('alex.eurosky.social', r)).rejects.toMatchObject({
      code: 'handleNotFound',
    });
  });

  it('reports unknown handles', async () => {
    await expect(resolveAccount('nobody.example.com', resolver())).rejects.toMatchObject({
      code: 'handleNotFound',
    });
  });

  it.each([
    'http://pds.example',
    'https://pds.example:8443',
    'https://user:pass@pds.example',
    'not a url',
  ])('refuses to use PDS endpoint %s', async (pds) => {
    const r = resolver({ resolveDid: async () => ({ handle: 'alex.eurosky.social', pds }) });
    await expect(resolveAccount('alex.eurosky.social', r)).rejects.toMatchObject({ code: 'noPds' });
  });
});
