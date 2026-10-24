import 'server-only';
import type { Client } from '@atproto/lex';
import { PrivateBlobStore } from '@homeward/db';
import { pet } from '@homeward/lexicons';
import { getPreferences } from '@/i18n/preferences';
import { listAnimals, loadAnimal, type AnimalSummary } from '../animals/animals';
import { getDb, getKeyring } from '../db';
import { getGeocoder } from '../geocode';
import { lookupRecord } from '../onboarding/current-role';
import { locate } from '../onboarding/place';
import { getPrivateStore } from '../private-store';
import { tooYoung } from '../welfare';
import {
  animalKey,
  mergeListing,
  OPEN_STATUSES,
  parseListingForm,
  publishProblems,
  type ListingFormErrors,
  type ListingFormValues,
  type ListingRecord,
} from './listing-form';
import { canChange, isPublicStatus, parseAdoptedAt, withStatus } from './lifecycle';
import { publishAnimal, publishListing, PublishError, type PublishDeps } from './publish';

const DRAFT = 'pet.homeward.listing';

export interface ListingSummary {
  rkey: string;
  /** The listing's own title, else its animals' names. */
  title?: string;
  animals: string[];
  status: string;
  published: boolean;
  adoptedAt?: string;
}

export type ListingLookup =
  | { kind: 'found'; published: boolean; record: ListingRecord }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

export type ListingFormState =
  | { status: 'idle' }
  | {
      status: 'saved';
      values: ListingFormValues;
      published: boolean;
      /** Why the listing's own place has no coordinates, if it doesn't. */
      unlocated?: 'notFound' | 'unavailable';
    }
  | {
      status: 'error';
      values: ListingFormValues;
      errors: ListingFormErrors;
      /** Places with the typed name, for the person to choose from. */
      placeChoices?: string[];
      /** The organisation's account couldn't be reached, so nothing was saved. */
      publishFailed?: boolean;
    };

export type PublishResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'missing' | 'notReady' | 'conflict' | 'unavailable' | 'photoMissing' | 'tooYoung';
    };

interface StoredListing {
  rkey: string;
  record: ListingRecord;
  published: boolean;
}

const deps = (client: Client): PublishDeps => ({
  client,
  store: getPrivateStore(),
  blobs: new PrivateBlobStore(getDb(), getKeyring()),
});

/** Drafts from Homeward and published listings from the organisation's account. */
async function allListings(
  did: string,
  client: Client,
): Promise<{ listings: StoredListing[]; pdsUnavailable: boolean }> {
  const listings: StoredListing[] = [];
  let cursor: string | undefined;
  do {
    const page = await getPrivateStore().list(did, DRAFT, { limit: 100, cursor });
    for (const { rkey, value } of page.records) {
      const { $type: _type, ...record } = value;
      listings.push({ rkey, record, published: false });
    }
    cursor = page.cursor;
  } while (cursor);

  try {
    let pdsCursor: string | undefined;
    do {
      const page = await client.list(pet.homeward.listing, { limit: 100, cursor: pdsCursor });
      for (const { uri, value } of page.records) {
        // Records the client validated against the lexicon; its inferred type is too loose.
        const { $type: _type, ...record } = value as unknown as pet.homeward.listing.Main;
        listings.push({ rkey: uri.split('/').pop()!, record, published: true });
      }
      pdsCursor = page.records.length > 0 ? page.cursor : undefined;
    } while (pdsCursor);
  } catch (err) {
    console.warn('Could not list published listings', err);
    return { listings, pdsUnavailable: true };
  }
  return { listings, pdsUnavailable: false };
}

/** Animals already in another open listing, by record key, with that listing's key. */
function takenAnimals(
  did: string,
  listings: StoredListing[],
  except: string,
): Map<string, StoredListing> {
  const taken = new Map<string, StoredListing>();
  for (const listing of listings) {
    if (listing.rkey === except || !OPEN_STATUSES.includes(listing.record.status)) continue;
    for (const uri of listing.record.animals) {
      const rkey = animalKey(did, uri);
      if (rkey) taken.set(rkey, listing);
    }
  }
  return taken;
}

const names = (did: string, record: ListingRecord, animals: AnimalSummary[]) =>
  record.animals.map(
    (uri) => animals.find((animal) => animal.rkey === animalKey(did, uri))?.name ?? '?',
  );

/** The organisation's listings, newest first, with their animals' names. */
export async function listListings(did: string, client: Client) {
  const [{ listings, pdsUnavailable }, { animals }] = await Promise.all([
    allListings(did, client),
    listAnimals(did, client),
  ]);
  const summaries: ListingSummary[] = listings
    .sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt))
    .map(({ rkey, record, published }) => ({
      rkey,
      title: record.title,
      animals: names(did, record, animals),
      status: record.status,
      published,
      ...(record.adoptedAt && { adoptedAt: record.adoptedAt }),
    }));
  // Animals that could go into a new listing: not in any open one.
  const taken = takenAnimals(did, listings, '');
  return {
    listings: summaries,
    unlisted: animals.filter((animal) => !taken.has(animal.rkey)),
    pdsUnavailable,
  };
}

/** The animals the editor offers, and which are already in another open listing. */
export async function animalChoices(did: string, client: Client, except: string) {
  const [{ listings, pdsUnavailable }, { animals }] = await Promise.all([
    allListings(did, client),
    listAnimals(did, client),
  ]);
  const taken = takenAnimals(did, listings, except);
  return {
    animals: animals.map((animal) => {
      const other = taken.get(animal.rkey);
      return {
        ...animal,
        ...(other && {
          takenBy: {
            rkey: other.rkey,
            title: other.record.title ?? names(did, other.record, animals).join(', '),
          },
        }),
      };
    }),
    pdsUnavailable,
  };
}

/** One listing: a private draft if there is one, otherwise the published record. */
export async function loadListing(
  did: string,
  client: Client,
  rkey: string,
): Promise<ListingLookup> {
  const draft = await getPrivateStore().get(did, DRAFT, rkey);
  if (draft) {
    const { $type: _type, ...record } = draft;
    return { kind: 'found', published: false, record };
  }
  const published = await lookupRecord(() => client.get(pet.homeward.listing, { rkey }));
  if (published.kind !== 'found') return published;
  return { kind: 'found', published: true, record: published.record };
}

/**
 * Saves the listing editor. A draft stays private in Homeward; a published listing is
 * updated on the organisation's account straight away, publishing any draft animals added
 * to it first.
 */
export async function saveListing(
  did: string,
  client: Client,
  rkey: string,
  form: FormData,
): Promise<Exclude<ListingFormState, { status: 'idle' }>> {
  const parsed = parseListingForm(form, { did });
  if (!parsed.ok) return { status: 'error', values: parsed.values, errors: parsed.errors };
  const { values } = parsed;
  const unavailable = { status: 'error', values, errors: {}, publishFailed: true } as const;

  const existing = await loadListing(did, client, rkey);
  if (existing.kind === 'unavailable') return unavailable;
  const [{ listings, pdsUnavailable }, { animals, pdsUnavailable: animalsUnavailable }] =
    await Promise.all([allListings(did, client), listAnimals(did, client)]);
  // Without the published listings and animals, the rules below can't be checked.
  if (pdsUnavailable || animalsUnavailable) return unavailable;

  const errors: ListingFormErrors = {};
  const taken = takenAnimals(did, listings, rkey);
  for (const key of parsed.animalKeys) {
    if (!animals.some((animal) => animal.rkey === key)) errors.animals = 'invalid';
    else if (taken.has(key)) {
      errors.animals = 'inOpenListing';
      errors[`animal.${key}`] = 'inOpenListing';
    }
  }
  if (Object.keys(errors).length > 0) return { status: 'error', values, errors };

  const previous = existing.kind === 'found' ? existing.record : undefined;
  let location: ListingRecord['location'];
  let unlocated: 'notFound' | 'unavailable' | undefined;
  if (parsed.place) {
    const chosen = form.get('place');
    const found = await locate(getGeocoder(), parsed.place, {
      previous: previous?.location,
      chosen: typeof chosen === 'string' ? chosen : undefined,
      language: (await getPreferences()).language,
    });
    if (found.kind === 'choose') {
      return {
        status: 'error',
        values,
        errors: {},
        placeChoices: found.choices.map((place) => place.label),
      };
    }
    location = {
      ...parsed.place,
      ...(found.kind === 'located' && {
        ...(found.region && { region: found.region }),
        ...found.coordinates,
      }),
    };
    if (found.kind === 'unlocated') unlocated = found.reason;
  }

  const listing = mergeListing(previous, parsed.content, location);
  const published = existing.kind === 'found' && existing.published;
  if (published) {
    // Public listings must stay complete: the same answers are needed as for publishing.
    for (const problem of publishProblems(listing)) {
      errors[problem === 'bonded' ? 'bonded' : 'fee.kind'] = 'required';
    }
    if (Object.keys(errors).length > 0) return { status: 'error', values, errors };
    try {
      const drafts = animals.filter((a) => !a.published && parsed.animalKeys.includes(a.rkey));
      for (const animal of drafts) await publishAnimal(deps(client), did, animal.rkey);
      await client.put(pet.homeward.listing, listing, { rkey });
    } catch (err) {
      console.warn('Could not update a published listing', err);
      return unavailable;
    }
  } else {
    await getPrivateStore().put(did, DRAFT, rkey, { $type: DRAFT, ...listing });
  }
  return { status: 'saved', values, published, ...(unlocated && { unlocated }) };
}

/** Publishes a draft listing, with its draft animals and their photos. */
export async function publishDraftListing(
  did: string,
  client: Client,
  rkey: string,
): Promise<PublishResult> {
  const draft = await getPrivateStore().get(did, DRAFT, rkey);
  if (!draft) return { ok: false, reason: 'missing' };
  const { $type: _type, ...listing } = draft;
  if (publishProblems(listing).length > 0) return { ok: false, reason: 'notReady' };

  const [{ listings, pdsUnavailable }, { animals, pdsUnavailable: animalsUnavailable }] =
    await Promise.all([allListings(did, client), listAnimals(did, client)]);
  if (pdsUnavailable || animalsUnavailable) return { ok: false, reason: 'unavailable' };
  const keys = listing.animals.map((uri) => animalKey(did, uri));
  const chosen = keys.map((key) => animals.find((animal) => animal.rkey === key));
  const taken = takenAnimals(did, listings, rkey);
  if (chosen.some((animal) => !animal) || keys.some((key) => key && taken.has(key))) {
    return { ok: false, reason: 'conflict' };
  }

  // Puppies and kittens under the minimum age can't be listed yet (#45).
  const records = await Promise.all(keys.map((key) => loadAnimal(did, client, key ?? '')));
  if (records.some((found) => found.kind === 'unavailable'))
    return { ok: false, reason: 'unavailable' };
  const found = records.flatMap((record) => (record.kind === 'found' ? [record.record] : []));
  if (tooYoung(found).length > 0) return { ok: false, reason: 'tooYoung' };

  try {
    const drafts = chosen.filter((animal) => animal && !animal.published).map((a) => a!.rkey);
    await publishListing(deps(client), did, rkey, listing, drafts);
  } catch (err) {
    if (err instanceof PublishError) return { ok: false, reason: err.reason };
    throw err;
  }
  return { ok: true };
}

/** Deletes a draft listing. Its animals stay, as drafts or published. */
export async function deleteListingDraft(did: string, rkey: string): Promise<boolean> {
  return getPrivateStore().delete(did, DRAFT, rkey);
}

export type StatusResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'notAllowed' | 'conflict' | 'invalidDate' | 'unavailable' };

/**
 * Changes a published listing's status (spec §2, Listing status). Relisting a withdrawn
 * listing, or undoing an adoption, needs its animals to be free of other open listings.
 */
export async function changeListingStatus(
  did: string,
  client: Client,
  rkey: string,
  to: string,
  adoptedAtInput?: string,
): Promise<StatusResult> {
  const found = await lookupRecord(() => client.get(pet.homeward.listing, { rkey }));
  if (found.kind !== 'found') return { ok: false, reason: found.kind };
  const listing = found.record;
  if (!isPublicStatus(to) || !canChange(listing.status, to)) {
    return { ok: false, reason: 'notAllowed' };
  }

  if (to === 'available' && (listing.status === 'withdrawn' || listing.status === 'adopted')) {
    const [{ listings, pdsUnavailable }, { animals, pdsUnavailable: animalsUnavailable }] =
      await Promise.all([allListings(did, client), listAnimals(did, client)]);
    if (pdsUnavailable || animalsUnavailable) return { ok: false, reason: 'unavailable' };
    const taken = takenAnimals(did, listings, rkey);
    const keys = listing.animals.map((uri) => animalKey(did, uri));
    const free = keys.every(
      (key) => key && !taken.has(key) && animals.some((animal) => animal.rkey === key),
    );
    if (!free) return { ok: false, reason: 'conflict' };
  }

  let adoptedAt: string | undefined;
  if (to === 'adopted') {
    const parsed = parseAdoptedAt(adoptedAtInput);
    if (parsed === 'invalid') return { ok: false, reason: 'invalidDate' };
    adoptedAt = parsed;
  }
  try {
    await client.put(pet.homeward.listing, withStatus(listing, to, adoptedAt), { rkey });
  } catch (err) {
    console.warn("Could not change a listing's status", err);
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: true };
}

/** Deletes a withdrawn listing from the organisation's account for good. Its animals stay. */
export async function deleteWithdrawnListing(
  did: string,
  client: Client,
  rkey: string,
): Promise<StatusResult> {
  const found = await lookupRecord(() => client.get(pet.homeward.listing, { rkey }));
  if (found.kind !== 'found') return { ok: false, reason: found.kind };
  if (found.record.status !== 'withdrawn') return { ok: false, reason: 'notAllowed' };
  try {
    await client.delete(pet.homeward.listing, { rkey });
  } catch (err) {
    console.warn('Could not delete a listing', err);
    return { ok: false, reason: 'unavailable' };
  }
  return { ok: true };
}
