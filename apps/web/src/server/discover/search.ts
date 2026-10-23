import 'server-only';
import { searchListings, type ListingSearch, type ListingSearchResult } from '@homeward/db';
import { evaluateMatch, type Household, type MatchSummary } from '@homeward/matching';
import { getCurrentUser } from '../auth/session';
import { getDb } from '../db';
import { getGeocoder } from '../geocode';
import { getCurrentRole } from '../onboarding/current-role';
import { resolvePlace } from '../onboarding/place';
import { getPrivateStore } from '../private-store';
import type { DiscoverFilters, Sort } from '@/lib/discover-filters';
import { effectiveSort, rankResults } from './rank';

const PAGE_SIZE = 24;
/** How many results are ranked by match at most; more than anyone pages through. */
const RANKED_LIMIT = 500;
const KM_PER_MILE = 1.609344;

export type Viewer = 'anonymous' | 'adopter' | 'organisation' | 'newcomer';

export interface DiscoverResult {
  listings: Array<ListingSearchResult & { match?: MatchSummary }>;
  viewer: Viewer;
  sort: Sort;
  /** Where distances are measured from, if anywhere. */
  origin?: { from: 'profile' | 'typed'; label: string };
  /** The typed place matched several: the visitor picks one. */
  placeChoices?: string[];
  /** The typed place wasn't found, or the lookup service was unavailable. */
  unlocated?: 'notFound' | 'unavailable';
  canMatch: boolean;
  /** The adopter has a location in their profile, used when no place is typed. */
  hasProfileLocation: boolean;
  next?: { cursor?: string; page?: number };
}

/**
 * Network-wide discovery (#39): the filters, distance from the adopter's private location or
 * a typed place, and, for adopters, a match summary per listing with best-match ranking.
 */
export async function discover(
  filters: DiscoverFilters,
  { unit, country, language }: { unit: 'kilometer' | 'mile'; country?: string; language: string },
): Promise<DiscoverResult> {
  const user = await getCurrentUser();
  const role = user ? await getCurrentRole() : undefined;
  const viewer: Viewer = !user
    ? 'anonymous'
    : role === 'adopter'
      ? 'adopter'
      : role === 'organisation'
        ? 'organisation'
        : 'newcomer';
  const store = getPrivateStore();
  const [household, ownLocation] =
    viewer === 'adopter'
      ? await Promise.all([
          store.get(user!.did, 'pet.homeward.adopter.household', 'self'),
          store.get(user!.did, 'pet.homeward.adopter.location', 'self'),
        ])
      : [undefined, undefined];

  // Where distance starts: a typed place wins; else the adopter's own (private) location.
  let origin: { latitude: number; longitude: number } | undefined;
  let originInfo: DiscoverResult['origin'];
  let placeChoices: string[] | undefined;
  let unlocated: DiscoverResult['unlocated'];
  if (filters.near) {
    const resolution = await resolvePlace(getGeocoder(), {
      locality: filters.near,
      country: filters.country ?? country ?? '',
      language,
      chosen: filters.place,
    });
    if (resolution.kind === 'found') {
      origin = {
        latitude: Number(resolution.place.latitude),
        longitude: Number(resolution.place.longitude),
      };
      originInfo = { from: 'typed', label: resolution.place.label };
    } else if (resolution.kind === 'ambiguous') {
      placeChoices = resolution.choices.map((place) => place.label);
    } else unlocated = resolution.kind;
  } else if (ownLocation?.latitude && ownLocation.longitude) {
    origin = { latitude: Number(ownLocation.latitude), longitude: Number(ownLocation.longitude) };
    originInfo = { from: 'profile', label: ownLocation.label ?? ownLocation.country };
  }

  const canMatch = household !== undefined;
  const sort = effectiveSort(filters.sort, { canMatch, hasOrigin: Boolean(origin) });
  const maxKm = filters.within && (unit === 'mile' ? filters.within * KM_PER_MILE : filters.within);
  const search: ListingSearch = {
    species: filters.species,
    sizes: filters.sizes,
    ageGroups: filters.ageGroups,
    sexes: filters.sexes,
    bonded: filters.bonded,
    feeKinds: filters.fees,
    ...(origin && { near: { ...origin, ...(maxKm && { maxKm }) } }),
    // Ranked by match within distance when there's a place, else within newest.
    sort: sort === 'newest' || !origin ? 'newest' : 'nearest',
  };
  const base = {
    viewer,
    sort,
    origin: originInfo,
    placeChoices,
    unlocated,
    canMatch,
    hasProfileLocation: Boolean(ownLocation?.latitude && ownLocation.longitude),
  };

  if (!canMatch) {
    const page = await searchListings(getDb(), {
      ...search,
      limit: PAGE_SIZE,
      cursor: filters.cursor,
    });
    return {
      ...base,
      listings: page.listings,
      ...(page.cursor && { next: { cursor: page.cursor } }),
    };
  }

  // Adopters: every result gets a match summary, so ranking and hiding happen over all of them.
  const { $type: _type, ...answers } = household!;
  const all: ListingSearchResult[] = [];
  let cursor: string | undefined;
  do {
    const page = await searchListings(getDb(), { ...search, limit: 100, cursor });
    all.push(...page.listings);
    cursor = page.cursor;
  } while (cursor && all.length < RANKED_LIMIT);
  const matched = all.map((listing) => ({
    ...listing,
    match: evaluateMatch({
      criteria: listing.criteria as never,
      household: answers as Household,
      distanceKm: listing.distanceKm,
    }).summary,
  }));
  const ranked = rankResults(matched, {
    hideConflicts: filters.hideConflicts,
    byMatch: sort === 'match',
  });
  const start = (filters.page - 1) * PAGE_SIZE;
  return {
    ...base,
    listings: ranked.slice(start, start + PAGE_SIZE),
    ...(ranked.length > start + PAGE_SIZE && { next: { page: filters.page + 1 } }),
  };
}
