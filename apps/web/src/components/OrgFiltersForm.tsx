'use client';

import { AGE_GROUPS, SIZES, SPECIES } from '@homeward/lexicons/taxonomy';
import { useTranslations } from 'next-intl';
import { CRITERIA_FILTERS, type OrgFilters } from '@/server/org-page/filters';
import { Button } from './Button';
import { CheckboxGroup, RadioGroup } from './Choices';

/** Filters for an organisation's animals: a plain GET form, so it works without JavaScript. */
export function OrgFiltersForm({ filters, active }: { filters: OrgFilters; active: boolean }) {
  const t = useTranslations('OrgPage');
  const taxonomy = useTranslations('Taxonomy');
  const selected: Record<string, readonly string[]> = {
    species: filters.species,
    size: filters.sizes,
    age: filters.ageGroups,
    stated: filters.criteria,
  };
  const checked = (name: string, value?: string) => selected[name]?.includes(value ?? '') ?? false;

  return (
    <details open={active} className="mb-8 rounded-md border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">{t('filters')}</summary>
      <form method="get" className="mt-4">
        <CheckboxGroup
          legend={t('species')}
          options={SPECIES.map((value) => ({
            name: 'species',
            value,
            label: taxonomy(`species.${value}`),
          }))}
          checked={checked}
        />
        <CheckboxGroup
          legend={t('size')}
          options={SIZES.map((value) => ({
            name: 'size',
            value,
            label: taxonomy(`size.${value}`),
          }))}
          checked={checked}
        />
        <CheckboxGroup
          legend={t('age')}
          hint={t('ageHint')}
          options={AGE_GROUPS.map((value) => ({
            name: 'age',
            value,
            label: taxonomy(`ageGroup.${value}`),
          }))}
          checked={checked}
        />
        <RadioGroup
          name="together"
          legend={t('together')}
          defaultValue={filters.bonded === undefined ? 'any' : filters.bonded ? 'bonded' : 'single'}
          options={[
            { value: 'any', label: t('togetherAny') },
            { value: 'bonded', label: t('togetherBonded') },
            { value: 'single', label: t('togetherSingle') },
          ]}
        />
        <CheckboxGroup
          legend={t('stated')}
          hint={t('statedHint')}
          options={CRITERIA_FILTERS.map((value) => ({
            name: 'stated',
            value,
            label: t(`criteria.${value}`),
          }))}
          checked={checked}
        />
        <Button type="submit">{t('apply')}</Button>
      </form>
    </details>
  );
}
