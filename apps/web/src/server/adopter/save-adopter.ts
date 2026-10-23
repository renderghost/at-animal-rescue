import 'server-only';
import type { Client } from '@atproto/lex';
import { toDatetimeString } from '@atproto/syntax';
import { pet } from '@homeward/lexicons';
import { getPreferences } from '@/i18n/preferences';
import { getGeocoder } from '../geocode';
import { lookupRecord } from '../onboarding/current-role';
import { resolvePlace } from '../onboarding/place';
import { getPrivateStore } from '../private-store';
import {
  mergeHousehold,
  parseAdopterForm,
  type AdopterFormErrors,
  type AdopterFormValues,
  type AdopterProfile,
  type PrivateLocation,
} from './adopter-form';

/** What the adopter profile form shows after submitting. */
export type AdopterFormState =
  | { status: 'idle' }
  | {
      status: 'saved';
      values: AdopterFormValues;
      /** Why the place typed wasn't saved; the previous location, if any, is kept. */
      unlocated?: 'notFound' | 'unavailable';
      /** The private answers are saved, but the public profile couldn't be updated. */
      publishFailed?: boolean;
      /** The area a public profile shows, from the saved location. */
      area?: PublicArea;
    }
  | {
      status: 'error';
      values: AdopterFormValues;
      errors: AdopterFormErrors;
      /** Places with the typed name, for the person to choose from. */
      placeChoices?: string[];
    };

export interface PublicArea {
  country: string;
  region?: string;
}

/** Only the region and country of the private location, never the town or coordinates. */
export function publicAreaOf(location: PrivateLocation | undefined): PublicArea | undefined {
  return (
    location && { country: location.country, ...(location.region && { region: location.region }) }
  );
}

const HOUSEHOLD = 'pet.homeward.adopter.household';
const LOCATION = 'pet.homeward.adopter.location';

const sameText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/**
 * Saves the adopter's private answers (household and location) in the private store, then
 * publishes, updates or removes their optional public profile in their own repository.
 */
export async function saveAdopterProfile(
  did: string,
  client: Client,
  form: FormData,
): Promise<Exclude<AdopterFormState, { status: 'idle' }>> {
  const parsed = parseAdopterForm(form);
  if (!parsed.ok) return { status: 'error', values: parsed.values, errors: parsed.errors };

  const store = getPrivateStore();
  const now = toDatetimeString(new Date());
  const existing = await store.get(did, LOCATION, 'self');

  // Location: kept while the place is unchanged, otherwise looked up again.
  let location: PrivateLocation | undefined;
  let unlocated: 'notFound' | 'unavailable' | undefined;
  if (
    parsed.place &&
    existing &&
    sameText(existing.label ?? '', parsed.place.text) &&
    existing.country === parsed.place.country
  ) {
    location = existing;
  } else if (parsed.place) {
    const chosen = form.get('place');
    const resolution = await resolvePlace(getGeocoder(), {
      locality: parsed.place.text,
      country: parsed.place.country,
      language: (await getPreferences()).language,
      chosen: typeof chosen === 'string' ? chosen : undefined,
    });
    if (resolution.kind === 'ambiguous') {
      return {
        status: 'error',
        values: parsed.values,
        errors: {},
        placeChoices: resolution.choices.map((place) => place.label),
      };
    }
    if (resolution.kind === 'found') {
      const { latitude, longitude, region } = resolution.place;
      location = {
        label: parsed.place.text,
        country: parsed.place.country,
        latitude,
        longitude,
        ...(region && { region }),
        updatedAt: now,
      };
    } else {
      // Keep what was there rather than lose it; the page says the new place wasn't found.
      location = existing;
      unlocated = resolution.kind;
    }
  }

  const household = await store.get(did, HOUSEHOLD, 'self');
  await store.put(did, HOUSEHOLD, 'self', {
    $type: HOUSEHOLD,
    ...mergeHousehold(household, parsed.household),
  });
  if (location && location !== existing) {
    await store.put(did, LOCATION, 'self', { ...location, $type: LOCATION });
  }
  if (!parsed.place && existing) await store.delete(did, LOCATION, 'self');

  const publishFailed = !(await updatePublicProfile(client, form, parsed, location));
  return {
    status: 'saved',
    values: parsed.values,
    ...(unlocated && { unlocated }),
    ...(publishFailed && { publishFailed }),
    ...(location && { area: publicAreaOf(location) }),
  };
}

/** Publishes, updates or removes the public profile. False if the PDS couldn't be reached. */
async function updatePublicProfile(
  client: Client,
  form: FormData,
  parsed: ReturnType<typeof parseAdopterForm>,
  location: PrivateLocation | undefined,
): Promise<boolean> {
  // Only remove a profile the page showed as published: if the page couldn't check, an
  // unticked box doesn't mean "remove it".
  const known = form.get('$publicProfileKnown') === '1';
  if (!parsed.publish && !known) return true;

  const current = await lookupRecord(() => client.get(pet.homeward.adopter.profile));
  if (current.kind === 'unavailable') return false;
  try {
    if (parsed.publish) {
      const profile: AdopterProfile = {
        ...(Object.keys(parsed.seeking).length > 0 && { seeking: parsed.seeking }),
        ...(location && { area: publicAreaOf(location) }),
        ...(parsed.about && { about: parsed.about }),
        createdAt:
          current.kind === 'found' ? current.record.createdAt : toDatetimeString(new Date()),
      };
      await client.put(pet.homeward.adopter.profile, profile);
    } else if (current.kind === 'found') {
      await client.delete(pet.homeward.adopter.profile);
    }
    return true;
  } catch (err) {
    console.warn('Could not update the adopter public profile', err);
    return false;
  }
}

/** Clears every private answer and the location. The (empty) household keeps the role. */
export async function clearAdopterAnswers(did: string): Promise<void> {
  const store = getPrivateStore();
  await store.put(did, HOUSEHOLD, 'self', {
    $type: HOUSEHOLD,
    updatedAt: toDatetimeString(new Date()),
  });
  await store.delete(did, LOCATION, 'self');
}
