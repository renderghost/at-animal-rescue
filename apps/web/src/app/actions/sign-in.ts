'use server';

import { redirect } from 'next/navigation';
import { clientAddress } from '@/server/auth/client-ip';
import { loginDependencies } from '@/server/auth/dependencies';
import { LoginError, loginWithAppPassword, type LoginErrorCode } from '@/server/auth/login';
import { startSession } from '@/server/auth/session';

export type SignInState =
  | { status: 'idle' }
  | {
      status: 'error';
      code: LoginErrorCode;
      identifier: string;
      /** With tooManyAttempts: how long until they can try again. */
      minutes?: number;
    };

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get('identifier') ?? '');
  const password = String(formData.get('password') ?? '');
  try {
    const ip = await clientAddress();
    const login = await loginWithAppPassword({ identifier, password, ip }, loginDependencies);
    await startSession(login.session);
  } catch (err) {
    if (err instanceof LoginError) {
      const minutes =
        err.retryAfter && Math.max(1, Math.ceil((err.retryAfter.getTime() - Date.now()) / 60_000));
      return { status: 'error', code: err.code, identifier, ...(minutes && { minutes }) };
    }
    throw err;
  }
  redirect('/welcome');
}
