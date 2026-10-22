'use server';

import { redirect } from 'next/navigation';
import { loginDependencies } from '@/server/auth/dependencies';
import { LoginError, loginWithAppPassword, type LoginErrorCode } from '@/server/auth/login';
import { startSession } from '@/server/auth/session';

export type SignInState =
  { status: 'idle' } | { status: 'error'; code: LoginErrorCode; identifier: string };

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get('identifier') ?? '');
  const password = String(formData.get('password') ?? '');
  try {
    const login = await loginWithAppPassword({ identifier, password }, loginDependencies);
    await startSession(login.session);
  } catch (err) {
    if (err instanceof LoginError) return { status: 'error', code: err.code, identifier };
    throw err;
  }
  redirect('/');
}
