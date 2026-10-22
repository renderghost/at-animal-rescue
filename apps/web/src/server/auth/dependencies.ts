import 'server-only';
import { safeFetchWrap } from '@atproto-labs/fetch-node';
import { getHandle, getPds, IdResolver } from '@atproto/identity';
import { PasswordSession } from '@atproto/lex-password-session';
import type { LoginDependencies } from './login';

// Handle and DID resolution use @atproto/identity's built-in SSRF-protected fetch.
const idResolver = new IdResolver({ timeout: 5000 });

// The PDS endpoint comes from a user-controlled DID document, so calls to it go through
// the same SSRF protection (no private IPs, no redirects to them, bounded responses).
const safeFetch = safeFetchWrap({ timeout: 10_000 }) as typeof globalThis.fetch;

export const loginDependencies: LoginDependencies = {
  resolver: {
    resolveHandle: (handle) => idResolver.handle.resolve(handle),
    async resolveDid(did) {
      const doc = await idResolver.did.resolve(did);
      return doc ? { handle: getHandle(doc), pds: getPds(doc) } : undefined;
    },
  },
  createSession: (input) => PasswordSession.login({ ...input, fetch: safeFetch }),
};
