'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { submitReport, type ReportFormState } from '@/app/actions/reports';
import {
  MAX_EXPLANATION,
  MAX_REPORTER_NAME,
  REPORT_REASONS,
  type ReportReason,
} from '@/lib/reports';
import { Button } from './Button';
import { RadioGroup } from './Choices';
import { Field, TextArea } from './Field';
import { FormAlert } from './FormAlert';

const initialState: ReportFormState = { status: 'idle' };

/**
 * Reporting a listing (#44): what's wrong, what they saw, optional contact details for the
 * outcome, and the good-faith confirmation; then the reference.
 */
export function ReportForm({ org, rkey, path }: { org: string; rkey: string; path: string }) {
  const t = useTranslations('Report');
  const [state, action, pending] = useActionState(submitReport, initialState);

  if (state.status === 'done') {
    return (
      <section aria-labelledby="report-done">
        <h2 id="report-done" className="mb-2 text-xl font-bold">
          {t('doneHeading')}
        </h2>
        <p role="status" className="mb-2">
          {t('doneReference', { reference: state.reference })}
        </p>
        <p className="mb-6">{state.emailed ? t('doneEmailed') : t('doneNoEmail')}</p>
        <Link href={path}>{t('doneBack')}</Link>
      </section>
    );
  }

  const values =
    state.status === 'error'
      ? state.values
      : { reason: '', explanation: '', name: '', email: '', goodFaith: false };
  const problems = state.status === 'error' ? state.problems : {};
  const errorOf = (field: keyof typeof problems, max?: number) => {
    const problem = problems[field];
    // Keys checked by the messages: each field's own problems.
    const key = `errors.${field}.${problem}` as 'errors.explanation.tooLong';
    return problem ? t(key, { max: max ?? 0 }) : undefined;
  };
  const goodFaithError = errorOf('goodFaith');

  return (
    // Re-mounted after each submission, so the fields show what was entered.
    <form action={action} noValidate key={JSON.stringify(state)}>
      {state.status === 'error' && state.unavailable && (
        <FormAlert>{t('errors.unavailable')}</FormAlert>
      )}
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="rkey" value={rkey} />
      <RadioGroup
        id="report-reason"
        name="reason"
        legend={t('reason')}
        error={errorOf('reason')}
        defaultValue={values.reason}
        options={REPORT_REASONS.map((reason: ReportReason) => ({
          value: reason,
          label: t(`reasons.${reason}.label`),
          hint: t(`reasons.${reason}.hint`),
        }))}
      />
      <TextArea
        id="report-explanation"
        name="explanation"
        label={t('explanation')}
        hint={t('explanationHint', { max: MAX_EXPLANATION })}
        error={errorOf('explanation', MAX_EXPLANATION)}
        defaultValue={values.explanation}
        rows={6}
      />

      <fieldset className="mb-6 rounded-lg border border-line bg-surface p-5">
        <legend className="px-1 font-semibold">{t('aboutYou')}</legend>
        <p className="mb-4 text-sm text-muted">{t('aboutYouHint')}</p>
        <Field
          id="report-name"
          name="name"
          label={t('name')}
          error={errorOf('name', MAX_REPORTER_NAME)}
          defaultValue={values.name}
          autoComplete="name"
          className="max-w-md"
        />
        <Field
          id="report-email"
          name="email"
          type="email"
          label={t('email')}
          error={errorOf('email')}
          defaultValue={values.email}
          autoComplete="email"
          className="max-w-md"
        />
      </fieldset>

      <div className="mb-6">
        {goodFaithError && (
          <p id="report-good-faith-error" className="mb-1 text-sm font-semibold text-danger">
            {goodFaithError}
          </p>
        )}
        <label className="flex items-start gap-2 font-semibold">
          <input
            type="checkbox"
            name="goodFaith"
            defaultChecked={values.goodFaith}
            className="mt-0.5 size-5 shrink-0 accent-accent"
            aria-describedby={goodFaithError ? 'report-good-faith-error' : undefined}
            aria-invalid={goodFaithError ? true : undefined}
          />
          {t('goodFaith')}
        </label>
      </div>

      <Button type="submit" disabled={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}
