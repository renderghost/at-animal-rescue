import 'server-only';
import { getHandle, getPds, IdResolver } from '@atproto/identity';
import { PasswordSession } from '@atproto/lex-password-session';
import { safeFetch } from './fetch';
import type { LoginDependencies } from './login';

// Handle and DID resolution use @atproto/identity's built-in SSRF-protected fetch.
const idResolver = new IdResolver({ timeout: 5000 });

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
