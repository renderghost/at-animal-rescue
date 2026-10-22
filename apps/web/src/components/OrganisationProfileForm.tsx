'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, type ReactNode } from 'react';
import { updateOrganisationProfile } from '@/app/actions/organisation-profile';
import { MAX_DONATION_LINKS } from '@/lib/organisation-limits';
import type { OrganisationFormState } from '@/server/onboarding/save-profile';
import { Button } from './Button';
import { Field, Select, TextArea } from './Field';
import {
  ContactFields,
  LocationFields,
  OrganisationFormAlert,
  useFieldError,
} from './OrganisationFields';

const initialState: OrganisationFormState = { status: 'idle' };

/** A titled part of the form; headings let people jump between parts. */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mb-10 border-t border-line pt-6">
      <h2 id={id} className="mb-4 text-xl font-bold">
        {title}
      </h2>
      {hint && <p className="mb-6 text-muted">{hint}</p>}
      {children}
    </section>
  );
}

/** Donation rows to show: those filled in, plus one blank, up to the maximum. */
function donationRows(values: Record<string, string>): number {
  let filled = 0;
  for (let i = 0; i < MAX_DONATION_LINKS; i++) {
    if (values[`donationUrl.${i}`] || values[`donationLabel.${i}`]) filled = i + 1;
  }
  return Math.min(filled + 1, MAX_DONATION_LINKS);
}

/** The full organisation profile editor. */
export function OrganisationProfileForm({
  initialValues,
  unlocated,
  countries,
}: {
  initialValues: Record<string, string>;
  /** Whether the saved profile has no coordinates yet. */
  unlocated: boolean;
  countries: Array<{ code: string; name: string }>;
}) {
  const t = useTranslations('OrganisationProfile');
  const labels = useTranslations('OrganisationForm');
  const [state, action, pending] = useActionState(updateOrganisationProfile, initialState);
  const values = state.status === 'idle' ? initialValues : state.values;
  const errors = state.status === 'error' ? state.errors : {};
  const error = useFieldError(errors);
  const stillUnlocated = state.status === 'saved' ? Boolean(state.unlocated) : unlocated;

  return (
    // Re-mounted after each submission, so fields show what was saved or entered.
    <form action={action} noValidate key={JSON.stringify(state)}>
      <OrganisationFormAlert state={state} />
      {state.status === 'saved' && (
        <p
          role="status"
          className={
            state.unlocated
              ? 'mb-6 rounded-md border border-unknown-line bg-unknown-soft p-4 text-unknown'
              : 'mb-6 rounded-md border border-match-line bg-match-soft p-4 text-match'
          }
        >
          {state.unlocated === 'notFound'
            ? t('savedNotFound', { locality: values.locality ?? '' })
            : state.unlocated === 'unavailable'
              ? t('savedUnavailable', { locality: values.locality ?? '' })
              : t('saved')}
        </p>
      )}

      <Section title={t('about')}>
        <Field
          name="displayName"
          label={labels('displayName')}
          error={error('displayName')}
          defaultValue={values.displayName}
          required
        />
        <TextArea
          name="description"
          label={t('description')}
          hint={t('descriptionHint')}
          error={error('description')}
          defaultValue={values.description}
        />
      </Section>

      <Section
        title={t('location')}
        hint={stillUnlocated && state.status !== 'saved' ? t('unlocated') : undefined}
      >
        <LocationFields
          values={values}
          errors={errors}
          countries={countries}
          placeChoices={state.status === 'error' ? state.placeChoices : undefined}
        />
      </Section>

      <Section title={t('contact')}>
        <ContactFields values={values} errors={errors} />
      </Section>

      <Section title={t('donations')} hint={t('donationsHint')}>
        {Array.from({ length: donationRows(values) }, (_, i) => (
          <fieldset key={i} className="mb-6 rounded-md border border-line p-4">
            <legend className="px-1 font-semibold">{t('donationLink', { number: i + 1 })}</legend>
            <Field
              name={`donationUrl.${i}`}
              type="url"
              label={t('donationUrl')}
              hint={labels('websiteHint')}
              error={error(`donationUrl.${i}`)}
              defaultValue={values[`donationUrl.${i}`]}
              placeholder="https://"
            />
            <Field
              name={`donationLabel.${i}`}
              label={t('donationLabel')}
              hint={t('donationLabelHint')}
              error={error(`donationLabel.${i}`)}
              defaultValue={values[`donationLabel.${i}`]}
            />
            <Select
              name={`donationKind.${i}`}
              label={t('donationKind')}
              defaultValue={values[`donationKind.${i}`] || 'oneOff'}
            >
              <option value="oneOff">{t('donationKindOneOff')}</option>
              <option value="recurring">{t('donationKindRecurring')}</option>
              <option value="both">{t('donationKindBoth')}</option>
            </Select>
          </fieldset>
        ))}
      </Section>

      <Section title={t('charity')} hint={t('charityHint')}>
        <Field
          name="charityRegistry"
          label={t('charityRegistry')}
          hint={t('charityRegistryHint')}
          error={error('charityRegistry')}
          defaultValue={values.charityRegistry}
        />
        <Field
          name="charityNumber"
          label={t('charityNumber')}
          error={error('charityNumber')}
          defaultValue={values.charityNumber}
        />
        <Field
          name="charityUrl"
          type="url"
          label={t('charityUrl')}
          hint={labels('websiteHint')}
          error={error('charityUrl')}
          defaultValue={values.charityUrl}
          placeholder="https://"
        />
      </Section>

      <Section title={t('adoption')}>
        <TextArea
          name="adoptionProcess"
          label={t('adoptionProcess')}
          hint={t('adoptionProcessHint')}
          error={error('adoptionProcess')}
          defaultValue={values.adoptionProcess}
        />
      </Section>

      <Button type="submit" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
