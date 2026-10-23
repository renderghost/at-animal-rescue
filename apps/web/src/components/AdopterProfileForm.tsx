'use client';

import { AGE_GROUPS, SIZES, SPECIES } from '@homeward/lexicons/taxonomy';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useId, type ReactNode } from 'react';
import { updateAdopterProfile } from '@/app/actions/adopter-profile';
import type { YES_NO } from '@/lib/adopter-questions';
import {
  CHOICES,
  HOURS_ALONE_BANDS,
  MAX_ABOUT,
  MAX_PLACE,
  OTHER_ANIMALS,
  UNANSWERED,
} from '@/lib/adopter-questions';
import type { AdopterFormState, PublicArea } from '@/server/adopter/save-adopter';
import { Button } from './Button';
import { CheckboxGroup, RadioGroup } from './Choices';
import { Field, Select, TextArea } from './Field';
import { FormAlert } from './FormAlert';
import { PlaceChoices } from './PlaceChoices';

const initialState: AdopterFormState = { status: 'idle' };

/** A titled part of the form, marked private or public in words, not only colour. */
function Section({
  title,
  visibility,
  hint,
  children,
}: {
  title: string;
  visibility: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mb-10 border-t border-line pt-6">
      <h2 id={id} className="mb-4 flex flex-wrap items-baseline gap-x-3 text-xl font-bold">
        {title}
        <span className="rounded-sm border border-line-strong px-2 text-sm font-semibold text-muted">
          {visibility}
        </span>
      </h2>
      {hint && <p className="mb-6 text-muted">{hint}</p>}
      {children}
    </section>
  );
}

/** The adopter's private household answers and optional public profile. */
export function AdopterProfileForm({
  initialValues,
  publicProfileKnown,
  publicArea,
  countries,
  back,
}: {
  initialValues: Record<string, string>;
  /** Whether the page could check for a published profile (so unticking can remove it). */
  publicProfileKnown: boolean;
  /** The area the public profile shows (region and country). */
  publicArea?: PublicArea;
  countries: Array<{ code: string; name: string }>;
  /** The listing the adopter came from, to return to once they've saved (#40). */
  back?: { href: string; label: string };
}) {
  const t = useTranslations('AdopterProfile');
  const taxonomy = useTranslations('Taxonomy');
  const place = useTranslations('Place');
  const [state, action, pending] = useActionState(updateAdopterProfile, initialState);
  const values = state.status === 'idle' ? initialValues : state.values;
  const errors = state.status === 'error' ? state.errors : {};
  const error = (field: string) => {
    const kind = errors[field];
    if (!kind) return undefined;
    if (field === 'country') return t('errors.countryRequired');
    return t(`errors.${kind}`, { max: field === 'about' ? MAX_ABOUT : MAX_PLACE });
  };

  const yesNo = [
    { value: 'yes', label: t('yes') },
    { value: 'no', label: t('no') },
    { value: UNANSWERED, label: t('preferNotToSay') },
  ];
  const choice = (field: keyof typeof CHOICES, labels: Record<string, string>) => (
    <RadioGroup
      id={field}
      name={field}
      legend={t(field)}
      defaultValue={values[field] || UNANSWERED}
      options={[
        ...CHOICES[field].map((value) => ({ value, label: labels[value]! })),
        { value: UNANSWERED, label: t('preferNotToSay') },
      ]}
    />
  );
  const question = (
    field: keyof typeof YES_NO | 'children' | 'garden' | 'gardenSecure' | 'landlordPermission',
    hint?: string,
  ) => (
    <RadioGroup
      id={field}
      name={field}
      legend={t(field)}
      hint={hint}
      defaultValue={values[field] || UNANSWERED}
      options={yesNo}
    />
  );
  const ticked = (name: string) => values[name] === 'on';
  const typedPlace = values.location ?? '';
  const area = state.status === 'saved' ? state.area : publicArea;
  const areaName =
    area &&
    [area.region, countries.find(({ code }) => code === area.country)?.name ?? area.country]
      .filter(Boolean)
      .join(', ');

  return (
    // Re-mounted after each submission, so fields show what was saved or entered.
    <form action={action} noValidate key={JSON.stringify(state)}>
      <input type="hidden" name="$publicProfileKnown" value={publicProfileKnown ? '1' : '0'} />

      {state.status === 'error' &&
        (state.placeChoices && Object.keys(state.errors).length === 0 ? (
          <FormAlert>{place('chooseAlert', { place: typedPlace })}</FormAlert>
        ) : (
          <FormAlert>{t('invalidSummary')}</FormAlert>
        ))}
      {state.status === 'saved' && state.publishFailed && (
        <FormAlert>{t('publishFailed')}</FormAlert>
      )}
      {state.status === 'saved' && !state.publishFailed && (
        <p
          role="status"
          className={
            state.unlocated
              ? 'mb-6 rounded-md border border-unknown-line bg-unknown-soft p-4 text-unknown'
              : 'mb-6 rounded-md border border-match-line bg-match-soft p-4 text-match'
          }
        >
          {state.unlocated === 'notFound'
            ? t('savedNotFound', { place: typedPlace })
            : state.unlocated === 'unavailable'
              ? t('savedUnavailable', { place: typedPlace })
              : t('saved')}
          {back && (
            <>
              {' '}
              <Link href={back.href}>{back.label}</Link>
            </>
          )}
        </p>
      )}

      <Section title={t('household')} visibility={t('private')}>
        {question('children')}
        <Field
          id="youngestAge"
          name="youngestAge"
          type="number"
          inputMode="numeric"
          min={0}
          max={17}
          label={t('youngestAge')}
          hint={t('youngestAgeHint')}
          error={error('youngestAge')}
          defaultValue={values.youngestAge}
          className="max-w-32"
        />
        <RadioGroup
          id="otherAnimals"
          name="otherAnimals"
          legend={t('otherAnimals')}
          defaultValue={values.otherAnimals || UNANSWERED}
          options={[
            { value: 'none', label: t('otherAnimalsNone') },
            { value: 'some', label: t('otherAnimalsSome') },
            { value: UNANSWERED, label: t('preferNotToSay') },
          ]}
        />
        <CheckboxGroup
          legend={t('otherAnimalKinds')}
          hint={t('otherAnimalKindsHint')}
          error={error('otherAnimals')}
          options={OTHER_ANIMALS.map((kind) => ({
            name: `otherAnimal.${kind}`,
            label: t(`otherAnimal.${kind}`),
          }))}
          checked={ticked}
        />
        {choice('experience', {
          none: t('experienceNone'),
          some: t('experienceSome'),
          experienced: t('experienceExperienced'),
        })}
      </Section>

      <Section title={t('home')} visibility={t('private')}>
        {choice('homeType', { flat: t('homeTypeFlat'), house: t('homeTypeHouse') })}
        {question('garden')}
        {question('gardenSecure', t('gardenSecureHint'))}
        {choice('setting', {
          urban: t('settingUrban'),
          suburban: t('settingSuburban'),
          rural: t('settingRural'),
        })}
        {question('stepFree')}
        {choice('tenure', { own: t('tenureOwn'), rent: t('tenureRent') })}
        {question('landlordPermission', t('landlordPermissionHint'))}
      </Section>

      <Section title={t('care')} visibility={t('private')}>
        <RadioGroup
          id="hoursAlone"
          name="hoursAlone"
          legend={t('hoursAlone')}
          defaultValue={values.hoursAlone || UNANSWERED}
          options={[
            ...HOURS_ALONE_BANDS.map((band) => ({
              value: String(band),
              label: t(`hoursAloneBand.${band}`),
            })),
            { value: UNANSWERED, label: t('preferNotToSay') },
          ]}
        />
        {question('willingMedicalCare')}
        {question('willingSpecialDiet')}
        {question('willingBehaviouralSupport')}
      </Section>

      <Section title={t('visits')} visibility={t('private')}>
        {question('acceptsHomeVisit')}
        {question('canVisitSeveralTimes')}
      </Section>

      <Section title={t('whereYouLive')} visibility={t('private')}>
        <Field
          id="location"
          name="location"
          label={t('location')}
          hint={t('locationHint')}
          error={error('location')}
          defaultValue={values.location}
          autoComplete="off"
        />
        <Select
          name="country"
          label={t('country')}
          error={error('country')}
          defaultValue={values.country}
        >
          <option value="">{t('countryChoose')}</option>
          {countries.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
        {state.status === 'error' && state.placeChoices && (
          <PlaceChoices
            typed={typedPlace}
            choices={state.placeChoices}
            chosen={values.place}
            hint={t('placeChooseHint')}
          />
        )}
      </Section>

      <Section title={t('publicProfile')} visibility={t('optional')}>
        <label className="mb-1 flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            name="publish"
            defaultChecked={ticked('publish')}
            className="size-5 shrink-0 accent-accent"
            aria-describedby="publish-hint"
          />
          {t('publish')}
        </label>
        <p id="publish-hint" className="mb-2 text-sm text-muted">
          {t('publishHint')}
        </p>
        <p className="mb-6 text-sm text-muted">
          {areaName ? t('publicArea', { area: areaName }) : t('publicAreaNone')}
        </p>
        <CheckboxGroup
          legend={t('species')}
          options={SPECIES.map((key) => ({
            name: `species.${key}`,
            label: taxonomy(`species.${key}`),
          }))}
          checked={ticked}
        />
        <CheckboxGroup
          legend={t('sizes')}
          options={SIZES.map((key) => ({ name: `size.${key}`, label: taxonomy(`size.${key}`) }))}
          checked={ticked}
        />
        <CheckboxGroup
          legend={t('ageGroups')}
          options={AGE_GROUPS.map((key) => ({
            name: `ageGroup.${key}`,
            label: taxonomy(`ageGroup.${key}`),
          }))}
          checked={ticked}
        />
        <TextArea
          name="about"
          label={t('about')}
          hint={t('aboutHint')}
          error={error('about')}
          defaultValue={values.about}
        />
      </Section>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button type="submit" disabled={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
        {/* Next to the button too, as the saved message is at the top of a long form. */}
        {state.status === 'saved' && back && <Link href={back.href}>{back.label}</Link>}
      </div>
    </form>
  );
}
