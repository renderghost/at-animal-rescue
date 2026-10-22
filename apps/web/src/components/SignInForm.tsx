'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { signIn, type SignInState } from '@/app/actions/sign-in';
import { Button } from './Button';
import { Field } from './Field';

const initialState: SignInState = { status: 'idle' };

// Errors about the password are shown on the password field; the rest on the handle.
const passwordErrors = new Set(['invalidCredentials', 'fullAccessPassword']);

export function SignInForm() {
  const t = useTranslations('SignIn');
  const [state, action, pending] = useActionState(signIn, initialState);
  const error = state.status === 'error' ? t(`errors.${state.code}`) : undefined;
  const onPassword = state.status === 'error' && passwordErrors.has(state.code);

  return (
    <form action={action} className="max-w-md" noValidate>
      <Field
        name="identifier"
        label={t('identifierLabel')}
        hint={t('identifierHint')}
        error={onPassword ? undefined : error}
        defaultValue={state.status === 'error' ? state.identifier : ''}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <Field
        name="password"
        type="password"
        label={t('passwordLabel')}
        hint={t('passwordHint')}
        error={onPassword ? error : undefined}
        autoComplete="current-password"
        required
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
        <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noreferrer">
          {t('appPasswordHelp')}
        </a>
      </div>
    </form>
  );
}
