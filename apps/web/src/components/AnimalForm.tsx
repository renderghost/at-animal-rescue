'use client';

import { BREEDS, SEXES, SIZES, SPECIES, TRAITS } from '@homeward/lexicons/taxonomy';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { saveAnimalAction } from '@/app/actions/animals';
import { MAX_BREEDS, YES_NO_UNKNOWN } from '@/lib/animal-fields';
import type { AnimalFormState } from '@/server/animals/animals';
import { Button } from './Button';
import { CheckboxGroup, RadioGroup } from './Choices';
import { Field, Select, TextArea } from './Field';
import { FormAlert } from './FormAlert';

const initialState: AnimalFormState = { status: 'idle' };
const noSubscription = () => () => {};

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

/** The animal editor: a fast, structured form (#31). */
export function AnimalForm({
  rkey,
  initialValues = {},
  published = false,
  justCreated = false,
}: {
  /** The record key of an existing animal; new animals get one when first saved. */
  rkey?: string;
  initialValues?: Record<string, string>;
  published?: boolean;
  /** Arrived here straight after creating the draft, so confirm it was saved. */
  justCreated?: boolean;
}) {
  const t = useTranslations('AnimalEditor');
  const taxonomy = useTranslations('Taxonomy');
  const [state, action, pending] = useActionState(saveAnimalAction, initialState);
  const values = state.status === 'idle' ? initialValues : state.values;
  const errors = state.status === 'error' ? state.errors : {};
  const [species, setSpecies] = useState(values.species ?? '');
  const [ageMode, setAgeMode] = useState(values.ageMode || 'unknown');
  const locale = useLocale();
  // Fields that depend on another answer show only once JavaScript can reveal them; until
  // then (or without it) every field is there to fill in.
  const enhanced = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const show = (visible: boolean) => !enhanced || visible;
  const error = (field: string) => (errors[field] ? t(`errors.${errors[field]}`) : undefined);
  const label = (group: string, key: string) =>
    taxonomy.has(`${group}.${key}` as never) ? taxonomy(`${group}.${key}` as never) : key;
  const breedLabel = (value: string) =>
    species && taxonomy.has(`breed.${species}.${value}` as never)
      ? taxonomy(`breed.${species}.${value}` as never)
      : value;
  const yesNo = (name: string, hint?: string) => (
    <RadioGroup
      name={name}
      legend={t(name as 'neutered')}
      hint={hint}
      defaultValue={values[name] || YES_NO_UNKNOWN.unknown}
      options={[
        { value: 'yes', label: t('yes') },
        { value: 'no', label: t('no') },
        { value: YES_NO_UNKNOWN.unknown, label: t('notKnown') },
      ]}
    />
  );
  const knownBreeds = BREEDS[species as keyof typeof BREEDS];

  return (
    // Re-mounted after each save, so fields show what was saved or entered.
    <form action={action} noValidate key={JSON.stringify(state)}>
      {rkey && <input type="hidden" name="$rkey" value={rkey} />}
      {values.originalBirth && (
        <input type="hidden" name="originalBirth" value={values.originalBirth} />
      )}

      <p className="mb-8 rounded-md border border-line bg-surface p-4">
        {published ? t('publicNotice') : t('draftNotice')}
      </p>

      {state.status === 'error' && (
        <FormAlert>{state.publishFailed ? t('publishFailed') : t('invalidSummary')}</FormAlert>
      )}
      {(state.status === 'saved' || (state.status === 'idle' && justCreated)) && (
        <p
          role="status"
          className="mb-6 rounded-md border border-match-line bg-match-soft p-4 text-match"
        >
          {state.status === 'saved' && state.published ? t('saved') : t('savedDraft')}
        </p>
      )}

      <Section title={t('basics')} visibility={t('publicLabel')}>
        <Field
          name="name"
          label={t('name')}
          error={error('name')}
          defaultValue={values.name}
          required
        />
        <Select
          name="species"
          label={t('species')}
          error={error('species')}
          defaultValue={values.species ?? ''}
          onChange={(event) => setSpecies(event.target.value)}
          required
        >
          <option value="">{t('speciesChoose')}</option>
          {SPECIES.map((key) => (
            <option key={key} value={key}>
              {label('species', key)}
            </option>
          ))}
        </Select>
        {show(species === 'other' || Boolean(values.speciesDetail)) && (
          <Field
            name="speciesDetail"
            label={t('speciesDetail')}
            hint={t('speciesDetailHint')}
            error={error('speciesDetail')}
            defaultValue={values.speciesDetail}
          />
        )}
        <fieldset className="mb-6">
          <legend className="mb-1 font-semibold">{t('breeds')}</legend>
          <p className="mb-3 text-sm text-muted">{t('breedsHint')}</p>
          {knownBreeds && (
            <datalist id={`breeds-${species}`}>
              {knownBreeds.map((key) => (
                <option key={key} value={breedLabel(key)} />
              ))}
            </datalist>
          )}
          <div className="grid gap-x-4 sm:grid-cols-3">
            {Array.from({ length: MAX_BREEDS }, (_, i) => (
              <Field
                key={i}
                name={`breed.${i}`}
                label={t('breedN', { number: i + 1 })}
                error={error(`breed.${i}`)}
                defaultValue={values[`breed.${i}`] ? breedLabel(values[`breed.${i}`]!) : ''}
                list={knownBreeds ? `breeds-${species}` : undefined}
                autoComplete="off"
              />
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="mixedBreed"
              defaultChecked={values.mixedBreed === 'on'}
              className="size-5 accent-accent"
            />
            {t('mixedBreed')}
          </label>
        </fieldset>
        <RadioGroup
          name="sex"
          legend={t('sex')}
          defaultValue={values.sex || 'unknown'}
          options={SEXES.map((key) => ({
            value: key,
            label: key === 'unknown' ? t('notKnown') : label('sex', key),
          }))}
        />
      </Section>

      <Section title={t('age')} visibility={t('publicLabel')} hint={t('ageHint')}>
        <fieldset className="mb-6">
          <legend className="mb-2 font-semibold">{t('ageMode')}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(['date', 'age', 'unknown'] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="ageMode"
                  value={mode}
                  defaultChecked={ageMode === mode}
                  onChange={() => setAgeMode(mode)}
                  className="size-5 accent-accent"
                />
                {t(
                  mode === 'date'
                    ? 'ageModeDate'
                    : mode === 'age'
                      ? 'ageModeAge'
                      : 'ageModeUnknown',
                )}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-x-4 sm:grid-cols-3" hidden={!show(ageMode === 'date')}>
          <Field
            name="birthYear"
            label={t('birthYear')}
            inputMode="numeric"
            error={error('birthYear')}
            defaultValue={values.birthYear}
          />
          <Select
            name="birthMonth"
            label={t('birthMonth')}
            error={error('birthMonth')}
            defaultValue={values.birthMonth ?? ''}
          >
            <option value="">{t('birthMonthChoose')}</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
                  new Date(Date.UTC(2000, i, 1)),
                )}
              </option>
            ))}
          </Select>
          <Field
            name="birthDay"
            label={t('birthDay')}
            inputMode="numeric"
            error={error('birthDay')}
            defaultValue={values.birthDay}
          />
        </div>
        <div className="grid max-w-sm grid-cols-2 gap-x-4" hidden={!show(ageMode === 'age')}>
          <Field
            name="ageYears"
            label={t('ageYears')}
            inputMode="numeric"
            error={error('ageYears')}
            defaultValue={values.ageYears}
          />
          <Field
            name="ageMonths"
            label={t('ageMonths')}
            inputMode="numeric"
            error={error('ageMonths')}
            defaultValue={values.ageMonths}
          />
        </div>
      </Section>

      <Section title={t('appearance')} visibility={t('publicLabel')}>
        <RadioGroup
          name="size"
          legend={t('size')}
          defaultValue={values.size ?? ''}
          options={[
            ...SIZES.map((key) => ({ value: key, label: label('size', key) })),
            { value: '', label: t('notKnown') },
          ]}
        />
        <Field
          name="colours"
          label={t('colours')}
          hint={t('coloursHint')}
          error={error('colours')}
          defaultValue={values.colours}
        />
      </Section>

      <Section title={t('health')} visibility={t('publicLabel')} hint={t('healthPublic')}>
        {yesNo('neutered')}
        {yesNo('vaccinated')}
        {yesNo('microchipped', t('microchippedHint'))}
        <TextArea
          name="conditions"
          label={t('conditions')}
          hint={t('conditionsHint')}
          error={error('conditions')}
          defaultValue={values.conditions}
          rows={3}
        />
        <TextArea
          name="medication"
          label={t('medication')}
          error={error('medication')}
          defaultValue={values.medication}
          rows={3}
        />
        <TextArea
          name="notes"
          label={t('notes')}
          error={error('notes')}
          defaultValue={values.notes}
          rows={4}
        />
      </Section>

      <Section title={t('personality')} visibility={t('publicLabel')}>
        <CheckboxGroup
          legend={t('traits')}
          hint={t('traitsHint')}
          error={error('traits')}
          options={TRAITS.map((key) => ({ name: `trait.${key}`, label: label('trait', key) }))}
          checked={(name) => values[name] === 'on'}
        />
        <TextArea
          name="story"
          label={t('story')}
          hint={t('storyHint')}
          error={error('story')}
          defaultValue={values.story}
          rows={8}
        />
      </Section>

      <Section
        title={t('identification')}
        visibility={t('private')}
        hint={t('identificationPrivate')}
      >
        <Field
          name="microchip"
          label={t('microchip')}
          hint={t('microchipHint')}
          inputMode="numeric"
          autoComplete="off"
          error={error('microchip')}
          defaultValue={values.microchip}
        />
        <Field
          name="registry"
          label={t('registry')}
          error={error('registry')}
          defaultValue={values.registry}
        />
        <Field
          name="passportNumber"
          label={t('passportNumber')}
          autoComplete="off"
          error={error('passportNumber')}
          defaultValue={values.passportNumber}
        />
      </Section>

      <Button type="submit" disabled={pending}>
        {pending ? t('saving') : published ? t('save') : t('saveDraft')}
      </Button>
    </form>
  );
}
