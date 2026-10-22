'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { limitOf } from '@/lib/organisation-limits';
import { OSM_ATTRIBUTION } from '@/server/geocode/geocoder';
import type { OrganisationFormState } from '@/server/onboarding/save-profile';
import { Field, Select } from './Field';

type Values = Record<string, string>;
type Errors = Extract<OrganisationFormState, { status: 'error' }>['errors'];

/** The message for a field's error, if it has one. */
export function useFieldError(errors: Errors) {
  const t = useTranslations('OrganisationForm');
  return (field: string) => {
    const error = errors[field];
    return error && t(`errors.${error}`, { max: limitOf(field) ?? 0 });
  };
}

/**
 * The problem after submitting, announced and focused so it's read first. Forms re-mount
 * after each submission, so this runs every time it appears.
 */
export function FormAlert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="mb-6 rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
    >
      {children}
    </p>
  );
}

/** The alert for an organisation form's error state, if any. */
export function OrganisationFormAlert({ state }: { state: OrganisationFormState }) {
  const t = useTranslations('OrganisationForm');
  if (state.status !== 'error') return null;
  if (state.publishFailed) return <FormAlert>{t('publishFailed')}</FormAlert>;
  if (Object.keys(state.errors).length > 0) return <FormAlert>{t('invalidSummary')}</FormAlert>;
  if (state.placeChoices) {
    return (
      <FormAlert>{t('placeChooseAlert', { locality: state.values.locality ?? '' })}</FormAlert>
    );
  }
  return null;
}

/** Town, region and country, with a choice of places when the town name is ambiguous. */
export function LocationFields({
  values,
  errors,
  countries,
  defaultCountry = '',
  placeChoices,
}: {
  values?: Values;
  errors: Errors;
  countries: Array<{ code: string; name: string }>;
  defaultCountry?: string;
  placeChoices?: string[];
}) {
  const t = useTranslations('OrganisationForm');
  const error = useFieldError(errors);
  return (
    <>
      <Field
        name="locality"
        label={t('locality')}
        hint={t('localityHint')}
        error={error('locality')}
        defaultValue={values?.locality}
        required
      />
      <Field
        name="region"
        label={t('region')}
        error={error('region')}
        defaultValue={values?.region}
      />
      <Select
        name="country"
        label={t('country')}
        error={error('country')}
        defaultValue={values?.country || defaultCountry}
        required
      >
        <option value="">{t('countryChoose')}</option>
        {countries.map(({ code, name }) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </Select>
      {placeChoices && (
        <fieldset className="mb-6 rounded-md border border-line p-4">
          <legend className="px-1 font-semibold">
            {t('placeChoose', { locality: values?.locality ?? '' })}
          </legend>
          <p className="mb-3 text-sm text-muted">{t('placeChooseHint')}</p>
          {placeChoices.map((label) => (
            <label key={label} className="mb-2 flex items-start gap-2">
              <input
                type="radio"
                name="place"
                value={label}
                defaultChecked={values?.place === label}
                className="mt-0.5 size-5 shrink-0 accent-accent"
              />
              {label}
            </label>
          ))}
          <p className="mt-3 text-sm text-muted">
            {t.rich('placeSource', {
              link: (chunks) => <a href={OSM_ATTRIBUTION.href}>{chunks}</a>,
            })}
          </p>
        </fieldset>
      )}
    </>
  );
}

/** How adopters should get in touch: the preferred method, email and website. */
export function ContactFields({ values, errors }: { values?: Values; errors: Errors }) {
  const t = useTranslations('OrganisationForm');
  const error = useFieldError(errors);
  const labels = {
    email: t('preferredEmail'),
    bluesky: t('preferredBluesky'),
    website: t('preferredWebsite'),
  };
  return (
    <>
      <fieldset className="mb-6">
        <legend className="mb-2 font-semibold">{t('preferred')}</legend>
        {(['email', 'bluesky', 'website'] as const).map((value) => (
          <label key={value} className="mb-1 flex items-center gap-2">
            <input
              type="radio"
              name="preferred"
              value={value}
              defaultChecked={(values?.preferred || 'email') === value}
              className="size-5 accent-accent"
            />
            {labels[value]}
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
    </>
  );
}
