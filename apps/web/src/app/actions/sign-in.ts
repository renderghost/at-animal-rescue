'use server';

import { loginDependencies } from '@/server/auth/dependencies';
import { LoginError, loginWithAppPassword, type LoginErrorCode } from '@/server/auth/login';

export type SignInState =
  | { status: 'idle' }
  | { status: 'error'; code: LoginErrorCode; identifier: string }
  | { status: 'success'; handle: string };

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get('identifier') ?? '');
  const password = String(formData.get('password') ?? '');
  try {
    const login = await loginWithAppPassword({ identifier, password }, loginDependencies);
    // Sessions are not persisted until #20, so end this one straight away.
    await login.logout().catch(() => undefined);
    return { status: 'success', handle: login.session.handle };
  } catch (err) {
    if (err instanceof LoginError) return { status: 'error', code: err.code, identifier };
    throw err;
  }
}
