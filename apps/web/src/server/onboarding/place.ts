import { GeocoderUnavailableError, type GeocodedPlace, type Geocoder } from '../geocode/geocoder';

export type PlaceResolution =
  | { kind: 'found'; place: GeocodedPlace }
  | { kind: 'ambiguous'; choices: GeocodedPlace[] }
  | { kind: 'notFound' }
  | { kind: 'unavailable' };

export interface PlaceQuery {
  locality: string;
  region?: string;
  country: string;
  language?: string;
  /** The label of a place the person picked from an earlier list of choices. */
  chosen?: string;
}

const sameName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/** Finds the coordinates for a typed town, asking the person to choose when it's ambiguous. */
export async function resolvePlace(
  geocoder: Geocoder,
  query: PlaceQuery,
): Promise<PlaceResolution> {
  let results: GeocodedPlace[];
  try {
    results = await geocoder.search({
      text: [query.locality, query.region].filter(Boolean).join(', '),
      country: query.country,
      language: query.language,
    });
  } catch (err) {
    if (err instanceof GeocoderUnavailableError) return { kind: 'unavailable' };
    throw err;
  }

  const chosen = query.chosen && results.find((place) => place.label === query.chosen);
  if (chosen) return { kind: 'found', place: chosen };

  const matches = results.filter((place) => sameName(place.locality, query.locality));
  if (matches.length === 1) return { kind: 'found', place: matches[0]! };
  if (matches.length > 1) return { kind: 'ambiguous', choices: matches };
  // The geocoder knows the place under another name (e.g. a different language): let them pick.
  if (results.length > 0) return { kind: 'ambiguous', choices: results };
  return { kind: 'notFound' };
}

export interface Place {
  locality: string;
  region?: string;
  country: string;
  latitude?: string;
  longitude?: string;
}

export type Location =
  | {
      kind: 'located';
      coordinates: { latitude: string; longitude: string };
      /** The region of a place picked from a list, when none was typed. */
      region?: string;
    }
  | { kind: 'choose'; choices: GeocodedPlace[] }
  | { kind: 'unlocated'; reason: 'notFound' | 'unavailable' };

const samePlace = (a: Place, b: Place) =>
  sameName(a.locality, b.locality) &&
  sameName(a.region ?? '', b.region ?? '') &&
  a.country === b.country;

/**
 * Coordinates for a profile's place: kept from the previous version when the place hasn't
 * changed, otherwise looked up (asking the person to choose when it's ambiguous).
 */
export async function locate(
  geocoder: Geocoder,
  place: Place,
  { previous, chosen, language }: { previous?: Place; chosen?: string; language?: string } = {},
): Promise<Location> {
  if (previous?.latitude && previous.longitude && samePlace(previous, place)) {
    return {
      kind: 'located',
      coordinates: { latitude: previous.latitude, longitude: previous.longitude },
    };
  }
  const resolution = await resolvePlace(geocoder, { ...place, chosen, language });
  switch (resolution.kind) {
    case 'found': {
      const { latitude, longitude, region, label } = resolution.place;
      // Picking one of two Bergens says which one: keep that, so the public profile does too.
      const picked = label === chosen && !place.region && region;
      return {
        kind: 'located',
        coordinates: { latitude, longitude },
        ...(picked && { region: picked }),
      };
    }
    case 'ambiguous':
      return { kind: 'choose', choices: resolution.choices };
    default:
      return { kind: 'unlocated', reason: resolution.kind };
  }
}
