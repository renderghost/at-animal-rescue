'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { loginDependencies } from '@/server/auth/dependencies';
import { LoginError, loginWithAppPassword, type LoginErrorCode } from '@/server/auth/login';
import { startSession } from '@/server/auth/session';
import { backfillOnSignIn } from '@/server/index/index-writer';

export type SignInState =
  { status: 'idle' } | { status: 'error'; code: LoginErrorCode; identifier: string };

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get('identifier') ?? '');
  const password = String(formData.get('password') ?? '');
  try {
    const login = await loginWithAppPassword({ identifier, password }, loginDependencies);
    await startSession(login.session);
    const { did, service } = login.session;
    after(() => backfillOnSignIn(did, service));
  } catch (err) {
    if (err instanceof LoginError) return { status: 'error', code: err.code, identifier };
    throw err;
  }
  redirect('/welcome');
}
