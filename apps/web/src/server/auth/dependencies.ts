import 'server-only';
import { getHandle, getPds, IdResolver } from '@atproto/identity';
import { PasswordSession } from '@atproto/lex-password-session';
import { SignInFailureStore } from '@homeward/db';
import { getDb, getKeyring } from '../db';
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
  // Failed sign-ins per account and address (#67), counted in Postgres across instances.
  limiter: {
    blockedUntil: (key) => failures().blockedUntil(key),
    failed: (key) => failures().failed(key),
    succeeded: (did) => failures().succeeded(did),
  },
};

function failures() {
  return new SignInFailureStore(getDb(), getKeyring());
}
