import { AGE_GROUPS, SEXES, SIZES, SPECIES } from '@homeward/lexicons/taxonomy';
import { FEE_KINDS } from './listing-fields';

type AgeGroup = (typeof AGE_GROUPS)[number];

export const SORTS = ['match', 'nearest', 'newest'] as const;
export type Sort = (typeof SORTS)[number];

/** "Within" choices, in the visitor's own unit (km or miles). */
export const DISTANCES = [10, 25, 50, 100, 250] as const;

/** Discovery filters (#39), all in the URL so a search can be shared or bookmarked. */
export interface DiscoverFilters {
  species: string[];
  sizes: string[];
  ageGroups: AgeGroup[];
  sexes: string[];
  /** Only bonded groups (true), only single animals (false), or either. */
  bonded?: boolean;
  fees: string[];
  /** A town or postcode typed to search near, instead of the adopter's own location. */
  near?: string;
  country?: string;
  /** The place picked when the typed name matched several. */
  place?: string;
  /** Maximum distance in the visitor's unit. */
  within?: number;
  sort?: Sort;
  hideConflicts: boolean;
  /** Paging: a database cursor, or a page number when results are ranked by match. */
  cursor?: string;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const all = (params: SearchParams, key: string) => [params[key] ?? []].flat();
const first = (params: SearchParams, key: string) => all(params, key)[0]?.trim() || undefined;
const known = <T extends string>(values: string[], allowed: readonly T[]) =>
  allowed.filter((value) => values.includes(value));

/** Reads filters from the query string, ignoring anything unknown. */
export function parseDiscoverFilters(params: SearchParams): DiscoverFilters {
  const together = first(params, 'together');
  const within = Number(first(params, 'within'));
  const sort = first(params, 'sort');
  const page = Number(first(params, 'page'));
  const country = first(params, 'country')?.toUpperCase();
  return {
    species: known(all(params, 'species'), SPECIES),
    sizes: known(all(params, 'size'), SIZES),
    ageGroups: known(all(params, 'age'), AGE_GROUPS),
    sexes: known(all(params, 'sex'), SEXES),
    bonded: together === 'bonded' ? true : together === 'single' ? false : undefined,
    fees: known(all(params, 'fee'), FEE_KINDS),
    ...(first(params, 'near') && { near: first(params, 'near')!.slice(0, 100) }),
    ...(country && /^[A-Z]{2}$/.test(country) && { country }),
    ...(first(params, 'place') && { place: first(params, 'place')!.slice(0, 300) }),
    ...((DISTANCES as readonly number[]).includes(within) && { within }),
    ...((SORTS as readonly string[]).includes(sort ?? '') && { sort: sort as Sort }),
    hideConflicts: first(params, 'hide') === 'conflicts',
    ...(first(params, 'cursor') && { cursor: first(params, 'cursor') }),
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 50) : 1,
  };
}

/** The query string for these filters, with paging replaced (e.g. for "More animals"). */
export function discoverQuery(
  filters: DiscoverFilters,
  paging: { cursor?: string; page?: number } = {},
): string {
  const query = new URLSearchParams();
  for (const value of filters.species) query.append('species', value);
  for (const value of filters.sizes) query.append('size', value);
  for (const value of filters.ageGroups) query.append('age', value);
  for (const value of filters.sexes) query.append('sex', value);
  if (filters.bonded !== undefined) query.set('together', filters.bonded ? 'bonded' : 'single');
  for (const value of filters.fees) query.append('fee', value);
  if (filters.near) query.set('near', filters.near);
  if (filters.near && filters.country) query.set('country', filters.country);
  if (filters.near && filters.place) query.set('place', filters.place);
  if (filters.within) query.set('within', String(filters.within));
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.hideConflicts) query.set('hide', 'conflicts');
  if (paging.cursor) query.set('cursor', paging.cursor);
  if (paging.page && paging.page > 1) query.set('page', String(paging.page));
  const text = query.toString();
  return text ? `?${text}` : '';
}
