import { toDatetimeString } from '@atproto/syntax';
import type { pet } from '@homeward/lexicons';
import {
  DISTANCES,
  parseDiscoverFilters,
  type DiscoverFilters,
  type Sort,
} from './discover-filters';

/**
 * Saved searches (#41): Discover's filters kept privately under a name, as
 * `pet.homeward.adopter.savedSearch`. Pure, so the round trip can be tested.
 */

export type SavedSearchRecord = Omit<pet.homeward.adopter.savedSearch.Main, '$type'>;

/** How many searches one adopter can keep. */
export const MAX_SAVED_SEARCHES = 25;
export const MAX_NAME = 100;

const KM_PER_MILE = 1.609344;
const RECORD_SORT: Record<Sort, string> = {
  match: 'bestMatch',
  nearest: 'nearest',
  newest: 'newest',
};

/** A search to keep: every filter, but not the page they were on. */
export function savedSearchRecord(
  filters: DiscoverFilters,
  { name, unit, now = new Date() }: { name: string; unit: 'kilometer' | 'mile'; now?: Date },
): SavedSearchRecord {
  const { species, sizes, ageGroups, sexes, fees, near, country, place, within, sort } = filters;
  return {
    name,
    ...(species.length > 0 && { species }),
    ...(sizes.length > 0 && { sizes }),
    ...(ageGroups.length > 0 && { ageGroups }),
    ...(sexes.length > 0 && { sexes }),
    ...(filters.bonded !== undefined && { together: filters.bonded ? 'bonded' : 'single' }),
    ...(fees.length > 0 && { fees }),
    // A typed place is kept with the search, in the private store.
    ...(near && { near, ...(country && { country }), ...(place && { place }) }),
    ...(within && { maxKm: Math.round(unit === 'mile' ? within * KM_PER_MILE : within) }),
    ...(sort && { sort: RECORD_SORT[sort] }),
    ...(filters.hideConflicts && { hideConflicts: true }),
    createdAt: toDatetimeString(now),
  };
}

/** The "Within" choice closest to a distance in km, in the adopter's unit now. */
export function withinChoice(maxKm: number, unit: 'kilometer' | 'mile'): number {
  const value = unit === 'mile' ? maxKm / KM_PER_MILE : maxKm;
  return DISTANCES.reduce((best, choice) =>
    Math.abs(choice - value) < Math.abs(best - value) ? choice : best,
  );
}

/**
 * A saved search back as Discover's filters, read exactly as its URL would be, so anything
 * unknown or out of range is dropped the same way.
 */
export function savedSearchFilters(
  record: SavedSearchRecord,
  unit: 'kilometer' | 'mile',
): DiscoverFilters {
  const sort = Object.entries(RECORD_SORT).find(([, value]) => value === record.sort)?.[0];
  const together = record.together ?? (record.bondedOnly ? 'bonded' : undefined);
  return parseDiscoverFilters({
    species: record.species,
    size: record.sizes,
    age: record.ageGroups,
    sex: record.sexes,
    together,
    fee: record.fees,
    near: record.near,
    country: record.country,
    place: record.place,
    within: record.maxKm ? String(withinChoice(record.maxKm, unit)) : undefined,
    sort,
    hide: record.hideConflicts ? 'conflicts' : undefined,
  });
}
