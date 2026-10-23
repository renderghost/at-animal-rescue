'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { createOrganisation } from '@/app/actions/onboarding';
import type { OrganisationFormState } from '@/server/onboarding/save-profile';
import { Button } from './Button';
import { Field } from './Field';
import {
  ContactFields,
  LocationFields,
  OrganisationFormAlert,
  useFieldError,
} from './OrganisationFields';

const initialState: OrganisationFormState = { status: 'idle' };

/** The short form that creates an organisation's profile during onboarding. */
export function OrganisationForm({
  countries,
  defaultCountry,
}: {
  countries: Array<{ code: string; name: string }>;
  defaultCountry: string;
}) {
  const t = useTranslations('Welcome.org');
  const labels = useTranslations('OrganisationForm');
  const [state, action, pending] = useActionState(createOrganisation, initialState);
  const values = state.status === 'idle' ? undefined : state.values;
  const errors = state.status === 'error' ? state.errors : {};
  const error = useFieldError(errors);

  return (
    // React resets a form after its action runs, and selects and radios fall back to the
    // option chosen at mount. Re-mounting with the returned values keeps what was entered.
    <form action={action} noValidate key={values ? JSON.stringify(state) : 'initial'}>
      <OrganisationFormAlert state={state} />
      <Field
        name="displayName"
        label={labels('displayName')}
        error={error('displayName')}
        defaultValue={values?.displayName}
        required
      />
      <LocationFields
        values={values}
        errors={errors}
        countries={countries}
        defaultCountry={defaultCountry}
        placeChoices={state.status === 'error' ? state.placeChoices : undefined}
      />
      <ContactFields values={values} errors={errors} />
      <Button type="submit" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
