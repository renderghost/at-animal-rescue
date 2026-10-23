'use server';

import { EmailConfirmationStore } from '@homeward/db';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/server/auth/session';
import { getDb, getKeyring } from '@/server/db';
import { sendMail } from '@/server/mail';
import { getRepoClient, loadOrganisationProfile } from '@/server/onboarding/current-role';

export type EmailConfirmationError =
  | 'rateLimited'
  | 'wrong'
  | 'expired'
  | 'tooManyAttempts'
  | 'noCode'
  | 'sendFailed'
  | 'noEmail'
  | 'unavailable';

export type EmailConfirmationState =
  | { status: 'idle' }
  | { status: 'sent'; email: string }
  | { status: 'confirmed' }
  | { status: 'error'; error: EmailConfirmationError; retryAfter?: string; codeWaiting?: boolean };

/**
 * Sends a one-time code to the organisation's contact email, or checks one (#30). The
 * address always comes from the saved profile in its own repository, never from the form.
 */
export async function emailConfirmation(
  _previous: EmailConfirmationState,
  form: FormData,
): Promise<EmailConfirmationState> {
  const user = await getCurrentUser();
  const client = await getRepoClient();
  if (!user || !client) redirect('/sign-in');
  const profile = await loadOrganisationProfile(client);
  if (profile.kind === 'missing') redirect('/welcome');
  if (profile.kind === 'unavailable') return { status: 'error', error: 'unavailable' };
  const email = profile.record.contact.email;
  if (!email) return { status: 'error', error: 'noEmail' };

  const store = new EmailConfirmationStore(getDb(), getKeyring());
  if (form.get('intent') === 'send') {
    const started = await store.start(user.did, email);
    if (!started.ok) {
      return {
        status: 'error',
        error: 'rateLimited',
        retryAfter: started.retryAfter.toISOString(),
      };
    }
    const t = await getTranslations('EmailConfirmation');
    try {
      await sendMail({
        to: email,
        subject: t('mailSubject', { code: started.code }),
        text: t('mailBody', { code: started.code }),
      });
    } catch (err) {
      console.warn('Could not send a confirmation code', err);
      return { status: 'error', error: 'sendFailed' };
    }
    return { status: 'sent', email };
  }

  const code = form.get('code');
  const result = await store.confirm(user.did, email, typeof code === 'string' ? code : '');
  if (result === 'confirmed') return { status: 'confirmed' };
  return { status: 'error', error: result, codeWaiting: result === 'wrong' };
}
