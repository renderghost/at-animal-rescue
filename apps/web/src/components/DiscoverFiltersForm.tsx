'use client';

import { AGE_GROUPS, SEXES, SIZES, SPECIES } from '@homeward/lexicons/taxonomy';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { DISTANCES, type DiscoverFilters, type Sort } from '@/lib/discover-filters';
import { FEE_KINDS } from '@/lib/listing-fields';
import { Button } from './Button';
import { CheckboxGroup, RadioGroup } from './Choices';
import { Field, Select } from './Field';
import { PlaceChoices } from './PlaceChoices';

/** Discovery filters (#39): a plain GET form, so it works without JavaScript. */
export function DiscoverFiltersForm({
  filters,
  sort,
  canMatch,
  hasProfileLocation,
  countries,
  defaultCountry,
  unit,
  placeChoices,
}: {
  filters: DiscoverFilters;
  sort: Sort;
  canMatch: boolean;
  hasProfileLocation: boolean;
  countries: Array<{ code: string; name: string }>;
  defaultCountry?: string;
  unit: 'kilometer' | 'mile';
  placeChoices?: string[];
}) {
  const t = useTranslations('Discover');
  const org = useTranslations('OrgPage');
  const taxonomy = useTranslations('Taxonomy');
  const selected: Record<string, readonly string[]> = {
    species: filters.species,
    size: filters.sizes,
    age: filters.ageGroups,
    sex: filters.sexes,
    fee: filters.fees,
  };
  const checked = (name: string, value?: string) => selected[name]?.includes(value ?? '') ?? false;

  return (
    <form method="get" className="mb-8 rounded-md border border-line bg-surface p-4">
      <h2 className="mb-4 text-lg font-bold">{t('filters')}</h2>
      <CheckboxGroup
        legend={org('species')}
        options={SPECIES.map((value) => ({
          name: 'species',
          value,
          label: taxonomy(`species.${value}`),
        }))}
        checked={checked}
      />
      <CheckboxGroup
        legend={org('size')}
        options={SIZES.map((value) => ({ name: 'size', value, label: taxonomy(`size.${value}`) }))}
        checked={checked}
      />
      <CheckboxGroup
        legend={org('age')}
        hint={org('ageHint')}
        options={AGE_GROUPS.map((value) => ({
          name: 'age',
          value,
          label: taxonomy(`ageGroup.${value}`),
        }))}
        checked={checked}
      />
      <CheckboxGroup
        legend={t('sex')}
        options={SEXES.filter((value) => value !== 'unknown').map((value) => ({
          name: 'sex',
          value,
          label: taxonomy(`sex.${value}`),
        }))}
        checked={checked}
      />
      <RadioGroup
        name="together"
        legend={org('together')}
        defaultValue={filters.bonded === undefined ? 'any' : filters.bonded ? 'bonded' : 'single'}
        options={[
          { value: 'any', label: org('togetherAny') },
          { value: 'bonded', label: org('togetherBonded') },
          { value: 'single', label: org('togetherSingle') },
        ]}
      />
      <CheckboxGroup
        legend={t('fee')}
        options={FEE_KINDS.map((value) => ({ name: 'fee', value, label: t(`feeKinds.${value}`) }))}
        checked={checked}
      />

      <fieldset className="mb-6">
        <legend className="mb-2 font-semibold">{t('where')}</legend>
        <Field
          name="near"
          label={t('near')}
          hint={hasProfileLocation ? t('nearHint') : t('nearHintAnonymous')}
          defaultValue={filters.near}
          autoComplete="postal-code"
        />
        <Select
          name="country"
          label={t('country')}
          defaultValue={filters.country ?? defaultCountry ?? ''}
        >
          <option value="">{t('countryAny')}</option>
          {countries.map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
        {placeChoices && (
          <PlaceChoices
            typed={filters.near ?? ''}
            choices={placeChoices}
            chosen={filters.place}
            hint={t('chooseHint')}
          />
        )}
        <Select name="within" label={t('within')} defaultValue={String(filters.within ?? '')}>
          <option value="">{t('withinAny')}</option>
          {DISTANCES.map((distance) => (
            <option key={distance} value={distance}>
              {unit === 'mile'
                ? t('withinMile', { count: distance })
                : t('withinKm', { count: distance })}
            </option>
          ))}
        </Select>
      </fieldset>

      <Select name="sort" label={t('sort')} defaultValue={sort}>
        {canMatch && <option value="match">{t('sortMatch')}</option>}
        <option value="nearest">{t('sortNearest')}</option>
        <option value="newest">{t('sortNewest')}</option>
      </Select>
      {canMatch && (
        <label className="mb-6 flex items-center gap-2">
          <input
            type="checkbox"
            name="hide"
            value="conflicts"
            defaultChecked={filters.hideConflicts}
            className="size-5 accent-accent"
          />
          {t('hideConflicts')}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit">{t('apply')}</Button>
        <Link href="/discover">{t('clear')}</Link>
      </div>
    </form>
  );
}
