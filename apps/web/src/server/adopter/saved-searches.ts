import 'server-only';
import { newRecordKey } from '@homeward/db';
import { getTranslations } from 'next-intl/server';
import { discoverQuery, type DiscoverFilters } from '@/lib/discover-filters';
import { formatDistance } from '@/lib/format';
import {
  MAX_NAME,
  MAX_SAVED_SEARCHES,
  savedSearchFilters,
  savedSearchRecord,
} from '@/lib/saved-search';
import { getPrivateStore } from '../private-store';

const COLLECTION = 'pet.homeward.adopter.savedSearch';
const graphemes = new Intl.Segmenter();
const length = (value: string) => [...graphemes.segment(value)].length;

export interface SavedSearch {
  rkey: string;
  name: string;
  /** Discover's query string for it, in the adopter's unit now. */
  query: string;
  createdAt: string;
}

async function records(did: string) {
  // The cap keeps this to one page.
  const { records } = await getPrivateStore().list(did, COLLECTION, { limit: 100 });
  return records;
}

/** The adopter's saved searches, newest first. */
export async function listSavedSearches(
  did: string,
  unit: 'kilometer' | 'mile',
): Promise<SavedSearch[]> {
  return (await records(did))
    .map(({ rkey, value: { $type: _type, ...record } }) => ({
      rkey,
      name: record.name,
      query: discoverQuery(savedSearchFilters(record, unit)),
      createdAt: record.createdAt,
    }))
    .reverse();
}

export type NameProblem = 'nameRequired' | 'nameTooLong';

function nameProblem(name: string): NameProblem | undefined {
  if (!name) return 'nameRequired';
  if (length(name) > MAX_NAME) return 'nameTooLong';
  return undefined;
}

/** Saves Discover's current filters under a name, up to the cap. */
export async function saveSearch(
  did: string,
  filters: DiscoverFilters,
  name: string,
  unit: 'kilometer' | 'mile',
): Promise<'saved' | 'full' | NameProblem> {
  const problem = nameProblem(name);
  if (problem) return problem;
  if ((await records(did)).length >= MAX_SAVED_SEARCHES) return 'full';
  await getPrivateStore().put(did, COLLECTION, newRecordKey(), {
    $type: COLLECTION,
    ...savedSearchRecord(filters, { name, unit }),
  });
  return 'saved';
}

export async function renameSearch(
  did: string,
  rkey: string,
  name: string,
): Promise<'renamed' | 'missing' | NameProblem> {
  const problem = nameProblem(name);
  if (problem) return problem;
  const store = getPrivateStore();
  const record = await store.get(did, COLLECTION, rkey);
  if (!record) return 'missing';
  await store.put(did, COLLECTION, rkey, { ...record, name });
  return 'renamed';
}

export async function deleteSearch(did: string, rkey: string): Promise<boolean> {
  return getPrivateStore().delete(did, COLLECTION, rkey);
}

/** A name to start from, e.g. "Cats and rabbits near Utrecht, within 25 km". */
export async function suggestedName(
  filters: DiscoverFilters,
  { unit, locale }: { unit: 'kilometer' | 'mile'; locale: string },
): Promise<string> {
  const t = await getTranslations('SavedSearches');
  const animals = filters.species.map((species) => t('animals', { species }));
  const listed = new Intl.ListFormat(locale, { type: 'conjunction' }).format(animals);
  let name = listed ? listed.charAt(0).toLocaleUpperCase(locale) + listed.slice(1) : t('nameAll');
  if (filters.near) name = t('nameNear', { animals: name, place: filters.near });
  if (filters.within) {
    const km = unit === 'mile' ? filters.within * 1.609344 : filters.within;
    name = t('nameWithin', { name, distance: formatDistance(km, unit, locale) });
  }
  return [...graphemes.segment(name)]
    .slice(0, MAX_NAME)
    .map(({ segment }) => segment)
    .join('');
}
