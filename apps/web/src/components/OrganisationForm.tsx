'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { createOrganisation, type OrganisationFormState } from '@/app/actions/onboarding';
import { Button } from './Button';
import { Field } from './Field';

const initialState: OrganisationFormState = { status: 'idle' };
const select =
  'min-h-11 rounded-sm border border-line-strong bg-surface px-3 py-2 text-base text-fg aria-invalid:border-2 aria-invalid:border-danger';

export function OrganisationForm({
  countries,
  defaultCountry,
}: {
  countries: Array<{ code: string; name: string }>;
  defaultCountry: string;
}) {
  const t = useTranslations('Welcome.org');
  const [state, action, pending] = useActionState(createOrganisation, initialState);
  const values = state.status === 'error' ? state.values : undefined;
  const errors = state.status === 'error' ? state.errors : {};
  const error = (field: keyof typeof errors) =>
    errors[field] ? t(`errors.${errors[field]}`) : undefined;
  const countryId = useId();

  return (
    // React resets a form after its action runs, and selects and radios fall back to the
    // option chosen at mount. Re-mounting with the returned values keeps what was entered.
    <form action={action} noValidate key={values ? JSON.stringify(values) : 'initial'}>
      {state.status === 'error' && state.publishFailed && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
        >
          {t('publishFailed')}
        </p>
      )}
      <Field
        name="displayName"
        label={t('displayName')}
        error={error('displayName')}
        defaultValue={values?.displayName}
        required
      />
      <Field
        name="locality"
        label={t('locality')}
        hint={t('localityHint')}
        error={error('locality')}
        defaultValue={values?.locality}
        required
      />
      <Field name="region" label={t('region')} defaultValue={values?.region} />

      <div className="mb-6 grid gap-1">
        <label htmlFor={countryId} className="font-semibold">
          {t('country')}
        </label>
        {errors.country && (
          <span id={`${countryId}-error`} className="text-sm font-semibold text-danger">
            {error('country')}
          </span>
        )}
        <select
          id={countryId}
          name="country"
          defaultValue={values?.country ?? defaultCountry}
          className={select}
          aria-invalid={errors.country ? true : undefined}
          aria-describedby={errors.country ? `${countryId}-error` : undefined}
          required
        >
          <option value="">{t('countryChoose')}</option>
          {countries.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="mb-6">
        <legend className="mb-2 font-semibold">{t('preferred')}</legend>
        {(['email', 'bluesky', 'website'] as const).map((value) => (
          <label key={value} className="mb-1 flex items-center gap-2">
            <input
              type="radio"
              name="preferred"
              value={value}
              defaultChecked={(values?.preferred ?? 'email') === value}
              className="size-5 accent-accent"
            />
            {t(
              value === 'email'
                ? 'preferredEmail'
                : value === 'bluesky'
                  ? 'preferredBluesky'
                  : 'preferredWebsite',
            )}
          </label>
        ))}
      </fieldset>

      <Field
        name="email"
        type="email"
        label={t('email')}
        error={error('email')}
        defaultValue={values?.email}
        autoComplete="email"
      />
      <Field
        name="website"
        type="url"
        label={t('website')}
        hint={t('websiteHint')}
        error={error('website')}
        defaultValue={values?.website}
        placeholder="https://"
      />

      <Button type="submit" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
