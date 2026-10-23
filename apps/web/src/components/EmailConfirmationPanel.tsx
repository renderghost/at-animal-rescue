'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { emailConfirmation, type EmailConfirmationState } from '@/app/actions/email-confirmation';
import { Button } from './Button';
import { Field } from './Field';
import { FormAlert } from './FormAlert';

const initialState: EmailConfirmationState = { status: 'idle' };

/** Confirming the contact email with a one-time code, from the profile editor (#30). */
export function EmailConfirmationPanel({
  hasEmail,
  confirmed: confirmedDates,
  codeWaiting,
  locale,
}: {
  hasEmail: boolean;
  /** When the current address was confirmed and until when it counts, formatted on the server. */
  confirmed?: { on: string; until: string };
  /** A code was sent earlier and hasn't expired. */
  codeWaiting: boolean;
  locale: string;
}) {
  const t = useTranslations('EmailConfirmation');
  const [state, action, pending] = useActionState(emailConfirmation, initialState);
  // With the time zone, as this may be formatted on the server (without JavaScript).
  const time = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(value));
  const confirmed = state.status === 'confirmed';
  const askForCode =
    !confirmed &&
    (state.status === 'sent' ||
      (state.status === 'error' && state.codeWaiting) ||
      (state.status === 'idle' && codeWaiting));

  return (
    <section aria-labelledby="confirm-email" className="mt-12 border-t border-line pt-6">
      <h2 id="confirm-email" className="mb-3 text-xl font-bold">
        {t('heading')}
      </h2>
      <p className="mb-2 max-w-prose">{t('intro')}</p>
      <p className="mb-4 max-w-prose text-sm text-muted">{t('changedFirst')}</p>

      {state.status === 'error' && (
        <FormAlert>
          {state.error === 'rateLimited' && state.retryAfter
            ? t('errors.rateLimited', { time: time(state.retryAfter) })
            : t(`errors.${state.error}`)}
        </FormAlert>
      )}
      {state.status === 'sent' && (
        <p role="status" className="mb-4 rounded-md border border-line bg-sunken p-4">
          {t('sent', { email: state.email })}
        </p>
      )}
      {confirmed ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-match-line bg-match-soft p-4 text-match"
        >
          {t('confirmed')}
        </p>
      ) : (
        <p className="mb-4 font-semibold">
          {confirmedDates
            ? t('confirmedUntil', { date: confirmedDates.on, until: confirmedDates.until })
            : hasEmail
              ? t('notConfirmed')
              : t('noEmail')}
        </p>
      )}

      {hasEmail && !confirmed && (
        // Re-mounted per result, so the code field starts empty after each try.
        <form action={action} noValidate key={JSON.stringify(state)} className="max-w-sm">
          {askForCode && (
            <Field
              name="code"
              label={t('code')}
              hint={t('codeHint')}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              className="font-mono tracking-widest"
              required
            />
          )}
          <div className="flex flex-wrap gap-3">
            {askForCode && (
              <Button type="submit" name="intent" value="confirm" disabled={pending}>
                {t('confirm')}
              </Button>
            )}
            <Button
              type="submit"
              name="intent"
              value="send"
              variant={askForCode ? 'secondary' : 'primary'}
              disabled={pending}
            >
              {askForCode ? t('sendAgain') : confirmedDates ? t('confirmAgain') : t('send')}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
