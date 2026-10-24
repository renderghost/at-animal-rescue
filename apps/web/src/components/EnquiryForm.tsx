'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { prepareEnquiry, type EnquiryState } from '@/app/actions/enquiry';
import { Button, ButtonLink } from './Button';
import { CopyButton } from './CopyButton';
import { Select, TextArea } from './Field';
import { FormAlert } from './FormAlert';

const initialState: EnquiryState = { status: 'idle' };

export interface EnquiryContact {
  preferred: 'email' | 'bluesky' | 'website';
  blueskyHref: string;
  websiteHref?: string;
}

/**
 * An adopter's enquiry (#42): their message, whether to include a link to their answers,
 * and exactly what that shares; then the message, ready to send from their own app.
 */
export function EnquiryForm({
  org,
  rkey,
  name,
  defaultMessage,
  days,
  defaultDays,
  shared,
  maxMessage,
  contact,
}: {
  /** The organisation's handle or DID, and the listing's record key. */
  org: string;
  rkey: string;
  /** The organisation's name. */
  name: string;
  defaultMessage: string;
  days: readonly number[];
  defaultDays: number;
  /** What the link shows, already worded. */
  shared: { see: string[]; notes: string[] };
  maxMessage: number;
  contact: EnquiryContact;
}) {
  const t = useTranslations('Enquire');
  const [state, action, pending] = useActionState(prepareEnquiry, initialState);

  if (state.status === 'ready') {
    const primary =
      contact.preferred === 'email' && state.mailto ? (
        <ButtonLink href={state.mailto}>{t('openEmail')}</ButtonLink>
      ) : contact.preferred === 'website' && contact.websiteHref ? (
        <ButtonLink href={contact.websiteHref}>{t('openWebsite', { name })}</ButtonLink>
      ) : (
        <ButtonLink href={contact.blueskyHref}>{t('openBluesky', { name })}</ButtonLink>
      );
    const pasting = !(contact.preferred === 'email' && state.mailto);
    return (
      <section aria-labelledby="ready">
        <h2 id="ready" className="mb-2 text-xl font-bold">
          {t('readyHeading')}
        </h2>
        <p role="status" className="mb-4">
          {state.until ? t('readyWithLink', { date: state.until }) : t('readyNoLink')}
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          {primary}
          {pasting && state.mailto && <a href={state.mailto}>{t('orEmail', { name })}</a>}
        </div>
        {pasting && <p className="mb-4">{t('pasteHint', { name })}</p>}
        <TextArea
          id="enquiry-ready"
          label={t('messageReady')}
          value={state.message}
          readOnly
          rows={12}
        />
        <CopyButton text={state.message} />
        <p className="mt-6 text-sm text-muted">{t('lost')}</p>
        <p className="mt-2">
          <Link href="/adopter/shares">{t('manage')}</Link>
        </p>
      </section>
    );
  }

  const values =
    state.status === 'error'
      ? state
      : { message: defaultMessage, include: true, days: defaultDays };
  const problem = state.status === 'error' ? state.problem : undefined;
  return (
    // Re-mounted after each submission, so the fields show what was entered.
    <form action={action} noValidate key={JSON.stringify(state)}>
      {problem === 'unavailable' && <FormAlert>{t('errors.unavailable')}</FormAlert>}
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="rkey" value={rkey} />
      <TextArea
        id="enquiry-message"
        name="message"
        label={t('message')}
        defaultValue={values.message}
        rows={8}
        error={
          problem === 'messageRequired' || problem === 'messageTooLong'
            ? t(`errors.${problem}`, { max: maxMessage })
            : undefined
        }
      />

      <fieldset className="mb-6 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 font-semibold">{t('linkHeading')}</legend>
        <label className="mb-1 flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            name="include"
            defaultChecked={values.include}
            className="size-5 shrink-0 accent-accent"
            aria-describedby="include-hint"
          />
          {t('include')}
        </label>
        <p id="include-hint" className="mb-4 text-sm text-muted">
          {t('includeHint', { name })}
        </p>
        <Select
          id="enquiry-days"
          name="days"
          label={t('days')}
          defaultValue={String(values.days)}
          className="max-w-48"
        >
          {days.map((count) => (
            <option key={count} value={count}>
              {t('daysOption', { count })}
            </option>
          ))}
        </Select>
        <h3 className="mb-2 font-semibold">{t('willSee', { name })}</h3>
        <ul className="mb-4 grid list-disc gap-1 pl-6">
          {shared.see.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <ul className="grid gap-1 text-sm text-muted">
          {shared.notes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? t('preparing') : t('continue')}
      </Button>
    </form>
  );
}
