'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useActionState, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { saveListingAction } from '@/app/actions/listings';
import {
  ANY_LEVEL,
  CRITERIA_GROUPS,
  EXPERIENCE,
  HOME_TYPES,
  LEVELS,
  SETTINGS,
  type CriterionRow,
} from '@/lib/listing-fields';
import type { ListingFormState } from '@/server/listings/listings';
import { Button } from './Button';
import { CheckboxGroup, RadioGroup } from './Choices';
import { Field, Select, TextArea } from './Field';
import { FormAlert } from './FormAlert';
import { PlaceChoices } from './PlaceChoices';

const initialState: ListingFormState = { status: 'idle' };
const noSubscription = () => () => {};

export interface AnimalChoice {
  rkey: string;
  name: string;
  species: string;
  published: boolean;
  /** Another open listing this animal is already in. */
  takenBy?: { rkey: string; title: string };
}

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

/** The listing editor (#33): animals, criteria, fee and where the animals are. */
export function ListingForm({
  rkey,
  initialValues = {},
  published = false,
  justCreated = false,
  animals,
  countries,
  currencies,
  defaultCurrency,
}: {
  rkey?: string;
  initialValues?: Record<string, string>;
  published?: boolean;
  justCreated?: boolean;
  animals: AnimalChoice[];
  countries: Array<{ code: string; name: string }>;
  currencies: Array<{ code: string; name: string }>;
  defaultCurrency: string;
}) {
  const t = useTranslations('ListingEditor');
  const taxonomy = useTranslations('Taxonomy');
  const place = useTranslations('Place');
  const [state, action, pending] = useActionState(saveListingAction, initialState);
  const values = state.status === 'idle' ? initialValues : state.values;
  const errors = state.status === 'error' ? state.errors : {};
  const [levels, setLevels] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      CRITERIA_GROUPS.flatMap((g) => g.rows).map((row) => [
        row,
        values[`${row}.level`] || ANY_LEVEL,
      ]),
    ),
  );
  const [chosen, setChosen] = useState(
    () => animals.filter((animal) => values[`animal.${animal.rkey}`] === 'on').length,
  );
  const [feeKind, setFeeKind] = useState(values['fee.kind'] ?? '');
  // Details that depend on another answer show only once JavaScript can reveal them; until
  // then (or without it) every field is there to fill in.
  const enhanced = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const show = (visible: boolean) => !enhanced || visible;
  const error = (field: string) => {
    const code = errors[field];
    if (!code) return undefined;
    if (field === 'animals' && (code === 'required' || code === 'invalid')) {
      return t(code === 'required' ? 'errors.animalsRequired' : 'errors.animalsInvalid');
    }
    return t(`errors.${code}`);
  };
  const species = (key: string) =>
    taxonomy.has(`species.${key}` as never) ? taxonomy(`species.${key}` as never) : key;
  const yesNo = [
    { value: 'yes', label: t('yes') },
    { value: 'no', label: t('no') },
  ];

  const details = (row: CriterionRow): ReactNode => {
    switch (row) {
      case 'children':
        return (
          <>
            <RadioGroup
              name="children.allowed"
              legend={t('childrenAllowed')}
              error={error('children.allowed')}
              defaultValue={values['children.allowed']}
              options={[
                { value: 'yes', label: t('childrenYes') },
                { value: 'no', label: t('childrenNo') },
              ]}
            />
            <Field
              name="children.minAge"
              label={t('minAge')}
              hint={t('minAgeHint')}
              inputMode="numeric"
              error={error('children.minAge')}
              defaultValue={values['children.minAge']}
              className="max-w-32"
            />
          </>
        );
      case 'dogs':
      case 'cats':
      case 'smallAnimals':
        return (
          <RadioGroup
            name={`${row}.allowed`}
            legend={t('otherAllowed')}
            error={error(`${row}.allowed`)}
            defaultValue={values[`${row}.allowed`]}
            options={yesNo}
          />
        );
      case 'experience':
        return (
          <RadioGroup
            name="experience.minimum"
            legend={t('experienceMinimum')}
            error={error('experience.minimum')}
            defaultValue={values['experience.minimum']}
            options={EXPERIENCE.map((value) => ({
              value,
              label: t(
                value === 'none'
                  ? 'experienceNone'
                  : value === 'some'
                    ? 'experienceSome'
                    : 'experienceExperienced',
              ),
            }))}
          />
        );
      case 'homeType':
        return (
          <CheckboxGroup
            legend={t('homeTypes')}
            error={error('homeType')}
            options={HOME_TYPES.map((value) => ({ name: `homeType.${value}`, label: t(value) }))}
            checked={(name) => values[name] === 'on'}
          />
        );
      case 'garden':
        return (
          <label className="mb-6 flex items-center gap-2">
            <input
              type="checkbox"
              name="garden.secure"
              defaultChecked={values['garden.secure'] === 'on'}
              className="size-5 accent-accent"
            />
            {t('gardenSecure')}
          </label>
        );
      case 'setting':
        return (
          <CheckboxGroup
            legend={t('settings')}
            error={error('setting')}
            options={SETTINGS.map((value) => ({ name: `setting.${value}`, label: t(value) }))}
            checked={(name) => values[name] === 'on'}
          />
        );
      case 'timeAlone':
        return (
          <Field
            name="timeAlone.maxHours"
            label={t('maxHours')}
            inputMode="numeric"
            error={error('timeAlone.maxHours')}
            defaultValue={values['timeAlone.maxHours']}
            className="max-w-32"
          />
        );
      case 'medicalCare':
      case 'specialDiet':
      case 'behaviouralSupport':
        return (
          <TextArea
            name={`${row}.description`}
            label={t('description')}
            hint={t('descriptionHint')}
            error={error(`${row}.description`)}
            defaultValue={values[`${row}.description`]}
            rows={2}
          />
        );
      case 'distance':
        return (
          <Field
            name="distance.maxKm"
            label={t('maxKm')}
            inputMode="numeric"
            error={error('distance.maxKm')}
            defaultValue={values['distance.maxKm']}
            className="max-w-32"
          />
        );
      case 'multipleVisits':
        return (
          <Field
            name="multipleVisits.visits"
            label={t('visits')}
            hint={t('visitsHint')}
            inputMode="numeric"
            error={error('multipleVisits.visits')}
            defaultValue={values['multipleVisits.visits']}
            className="max-w-32"
          />
        );
      default:
        return null;
    }
  };

  return (
    // Re-mounted after each save, so fields show what was saved or entered.
    <form action={action} noValidate key={JSON.stringify(state)}>
      {rkey && <input type="hidden" name="$rkey" value={rkey} />}

      <p className="mb-8 rounded-md border border-line bg-surface p-4">
        {published ? t('publicNotice') : t('draftNotice')}
      </p>

      {state.status === 'error' &&
        (state.publishFailed ? (
          <FormAlert>{t('publishFailed')}</FormAlert>
        ) : state.placeChoices && Object.keys(state.errors).length === 0 ? (
          <FormAlert>
            {place('chooseAlert', { place: values['location.locality'] ?? '' })}
          </FormAlert>
        ) : (
          <FormAlert>{t('invalidSummary')}</FormAlert>
        ))}
      {(state.status === 'saved' || (state.status === 'idle' && justCreated)) && (
        <p
          role="status"
          className="mb-6 rounded-md border border-match-line bg-match-soft p-4 text-match"
        >
          {state.status === 'saved' && state.unlocated
            ? t('savedUnlocated', { place: values['location.locality'] ?? '' })
            : state.status === 'saved' && state.published
              ? t('saved')
              : t('savedDraft')}
        </p>
      )}

      <Section title={t('animals')}>
        {animals.length === 0 ? (
          <p className="mb-6">
            {t('noAnimals')} <Link href="/organisation/animals/new">{t('addAnimal')}</Link>
          </p>
        ) : (
          <fieldset
            className="mb-6"
            aria-describedby={`animals-hint${errors.animals ? ' animals-error' : ''}`}
          >
            <legend className="mb-1 font-semibold">{t('animals')}</legend>
            <p id="animals-hint" className="mb-1 text-sm text-muted">
              {t('animalsHint')}
            </p>
            {errors.animals && (
              <p id="animals-error" className="mb-1 text-sm font-semibold text-danger">
                {error('animals')}
              </p>
            )}
            <ul className="mt-2 grid gap-2">
              {animals.map((animal) => (
                <li key={animal.rkey}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      name={`animal.${animal.rkey}`}
                      defaultChecked={values[`animal.${animal.rkey}`] === 'on'}
                      disabled={Boolean(animal.takenBy)}
                      onChange={(event) => setChosen((n) => n + (event.target.checked ? 1 : -1))}
                      className="mt-0.5 size-5 shrink-0 accent-accent"
                    />
                    <span>
                      <span className="font-semibold">{animal.name}</span> (
                      {species(animal.species)},{' '}
                      {animal.published ? t('animalPublic') : t('animalDraft')})
                      {animal.takenBy && (
                        <span className="block text-sm text-muted">
                          {t('takenBy', { title: animal.takenBy.title })}
                        </span>
                      )}
                      {errors[`animal.${animal.rkey}`] && (
                        <span className="block text-sm font-semibold text-danger">
                          {error(`animal.${animal.rkey}`)}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <div hidden={!show(chosen > 1)}>
          <RadioGroup
            name="bonded"
            legend={t('bonded')}
            hint={t('bondedHint')}
            error={error('bonded')}
            defaultValue={values.bonded}
            options={[
              { value: 'yes', label: t('bondedYes') },
              { value: 'no', label: t('bondedNo') },
            ]}
          />
        </div>
      </Section>

      <Section title={t('details')}>
        <Field
          name="title"
          label={t('title')}
          hint={t('titleHint')}
          error={error('title')}
          defaultValue={values.title}
        />
        <TextArea
          name="summary"
          label={t('summary')}
          hint={t('summaryHint')}
          error={error('summary')}
          defaultValue={values.summary}
          rows={3}
        />
      </Section>

      <Section title={t('criteria')} hint={t('criteriaHint')}>
        {CRITERIA_GROUPS.map(({ group, rows }) => (
          <div key={group} className="mb-8">
            <h3 className="mb-4 text-lg font-bold">
              {taxonomy(`criterionGroup.${group}` as never)}
            </h3>
            {rows.map((row) => (
              <fieldset key={row} className="mb-4 rounded-md border border-line p-4">
                <legend className="px-1 font-semibold">{t(`rows.${row}`)}</legend>
                <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2">
                  {LEVELS.map((level) => (
                    <label key={level} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`${row}.level`}
                        value={level}
                        defaultChecked={(values[`${row}.level`] || ANY_LEVEL) === level}
                        onChange={() => setLevels((all) => ({ ...all, [row]: level }))}
                        className="size-5 accent-accent"
                      />
                      {t(level)}
                    </label>
                  ))}
                </div>
                {details(row) && (
                  <div className="mt-4" hidden={!show(levels[row] !== ANY_LEVEL)}>
                    {details(row)}
                  </div>
                )}
              </fieldset>
            ))}
          </div>
        ))}
      </Section>

      <Section title={t('fee')} hint={t('feeHint')}>
        <fieldset className="mb-6">
          <legend className="mb-1 font-semibold">{t('feeKind')}</legend>
          {errors['fee.kind'] && (
            <p className="mb-1 text-sm font-semibold text-danger">{error('fee.kind')}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {(['none', 'donation', 'fee'] as const).map((kind) => (
              <label key={kind} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="fee.kind"
                  value={kind}
                  defaultChecked={values['fee.kind'] === kind}
                  onChange={() => setFeeKind(kind)}
                  className="size-5 accent-accent"
                />
                {t(kind === 'none' ? 'feeNone' : kind === 'donation' ? 'feeDonation' : 'feeFee')}
              </label>
            ))}
          </div>
        </fieldset>
        <div
          className="grid gap-x-4 sm:grid-cols-2"
          hidden={!show(feeKind === 'donation' || feeKind === 'fee')}
        >
          <Field
            name="fee.amount"
            label={t('amount')}
            hint={t('amountHint')}
            inputMode="decimal"
            error={error('fee.amount')}
            defaultValue={values['fee.amount']}
          />
          <Select
            name="fee.currency"
            label={t('currency')}
            error={error('fee.currency')}
            defaultValue={values['fee.currency'] || defaultCurrency}
          >
            {currencies.map(({ code, name }) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </Select>
        </div>
      </Section>

      <Section title={t('location')} hint={t('locationHint')}>
        <Field
          name="location.locality"
          label={t('locality')}
          error={error('location.locality')}
          defaultValue={values['location.locality']}
        />
        <Field
          name="location.region"
          label={t('region')}
          hint={t('regionHint')}
          error={error('location.region')}
          defaultValue={values['location.region']}
        />
        <Select
          name="location.country"
          label={t('country')}
          error={error('location.country')}
          defaultValue={values['location.country'] ?? ''}
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
            typed={values['location.locality'] ?? ''}
            choices={state.placeChoices}
            chosen={values.place}
            hint={t('placeChooseHint')}
          />
        )}
      </Section>

      <Button type="submit" disabled={pending}>
        {pending ? t('saving') : published ? t('save') : t('saveDraft')}
      </Button>
    </form>
  );
}
