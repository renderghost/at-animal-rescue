import 'server-only';
import { PasswordSession, type SessionData } from '@atproto/lex-password-session';
import { SESSION_MAX_AGE_SECONDS, SessionStore } from '@homeward/db';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getDb, getKeyring } from '../db';
import { safeFetch } from './fetch';

const production = process.env.NODE_ENV === 'production';
// __Host- binds the cookie to this exact origin over HTTPS (no Domain, Path=/).
const COOKIE = production ? '__Host-hw_session' : 'hw_session';

function store() {
  return new SessionStore<SessionData>(getDb(), getKeyring());
}

export interface CurrentUser {
  did: string;
  handle: string;
}

/** Saves a signed-in PDS session server-side and gives the browser an opaque cookie. */
export async function startSession(session: SessionData): Promise<void> {
  const token = await store().create({ did: session.did, handle: session.handle, data: session });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

const readSession = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return undefined;
  const session = await store().get(token);
  return session ? { token, ...session } : undefined;
});

/** The signed-in account for this request, if any. */
export async function getCurrentUser(): Promise<CurrentUser | undefined> {
  const session = await readSession();
  return session && { did: session.did, handle: session.handle };
}

/**
 * A client for the signed-in user's PDS. Tokens refresh automatically when they expire;
 * rotated tokens are saved, and a session the PDS has revoked (e.g. the app password was
 * deleted) is removed here too.
 */
export async function getPdsSession(): Promise<PasswordSession | undefined> {
  const session = await readSession();
  if (!session) return undefined;
  const sessions = store();
  return new PasswordSession(session.data, {
    fetch: safeFetch,
    onUpdated: (data) => sessions.update(session.token, data),
    onDeleted: () => sessions.delete(session.token),
  });
}

/** Signs out: ends the session on the PDS (best effort), here, and in the browser. */
export async function endSession(): Promise<void> {
  const session = await readSession();
  if (session) {
    await PasswordSession.delete(session.data, { fetch: safeFetch }).catch(() => undefined);
    await store().delete(session.token);
  }
  (await cookies()).delete(COOKIE);
}
