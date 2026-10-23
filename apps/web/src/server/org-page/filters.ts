import { AGE_GROUPS, SIZES, SPECIES } from '@homeward/lexicons/taxonomy';

type AgeGroup = (typeof AGE_GROUPS)[number];

/** Stated criteria an adopter can filter on (keys of STATED_CRITERIA in @homeward/db). */
export const CRITERIA_FILTERS = ['children', 'dogs', 'cats', 'firstTimeOwners', 'flat'] as const;
export type CriterionFilter = (typeof CRITERIA_FILTERS)[number];

export interface OrgFilters {
  species: string[];
  sizes: string[];
  ageGroups: AgeGroup[];
  /** Only bonded groups (true), only single animals (false), or either. */
  bonded?: boolean;
  criteria: CriterionFilter[];
  cursor?: string;
}

type SearchParams = Record<string, string | string[] | undefined>;

const all = (params: SearchParams, key: string) => [params[key] ?? []].flat();
const known = <T extends string>(values: string[], allowed: readonly T[]) =>
  allowed.filter((value) => values.includes(value));

/** Reads filters from the query string, ignoring anything unknown. */
export function parseOrgFilters(params: SearchParams): OrgFilters {
  const together = all(params, 'together')[0];
  const cursor = all(params, 'cursor')[0];
  return {
    species: known(all(params, 'species'), SPECIES),
    sizes: known(all(params, 'size'), SIZES),
    ageGroups: known(all(params, 'age'), AGE_GROUPS),
    bonded: together === 'bonded' ? true : together === 'single' ? false : undefined,
    criteria: known(all(params, 'stated'), CRITERIA_FILTERS),
    ...(cursor && { cursor }),
  };
}

/** Whether any filter is set (the cursor is paging, not filtering). */
export function hasFilters(filters: OrgFilters): boolean {
  return (
    filters.species.length +
      filters.sizes.length +
      filters.ageGroups.length +
      filters.criteria.length >
      0 || filters.bonded !== undefined
  );
}

/** The query string for these filters, e.g. for the "More animals" link. */
export function filtersToQuery(filters: OrgFilters, cursor?: string): string {
  const query = new URLSearchParams();
  for (const value of filters.species) query.append('species', value);
  for (const value of filters.sizes) query.append('size', value);
  for (const value of filters.ageGroups) query.append('age', value);
  if (filters.bonded !== undefined) query.set('together', filters.bonded ? 'bonded' : 'single');
  for (const value of filters.criteria) query.append('stated', value);
  if (cursor) query.set('cursor', cursor);
  const text = query.toString();
  return text ? `?${text}` : '';
}
