/** A place a person can pick, with coordinates already coarsened to about 1 km. */
export interface GeocodedPlace {
  /** Human-readable name, e.g. "Utrecht, Utrecht, Netherlands". */
  label: string;
  locality: string;
  region?: string;
  /** ISO 3166-1 alpha-2, upper case. */
  country: string;
  /** Decimal degrees rounded to 2 places, as strings (the lexicon has no floats). */
  latitude: string;
  longitude: string;
}

export interface GeocodeQuery {
  /** Only the place name the person typed: never anything that identifies them. */
  text: string;
  country?: string;
  language?: string;
}

/** Turns a typed town or postcode area into places. Swappable (spec §2, Geocoding). */
export interface Geocoder {
  search(query: GeocodeQuery): Promise<GeocodedPlace[]>;
}

export class GeocoderUnavailableError extends Error {}

/** Required attribution wherever geocoded results are shown (OSM licence). */
export const OSM_ATTRIBUTION = {
  text: '© OpenStreetMap contributors',
  href: 'https://www.openstreetmap.org/copyright',
};

/** Rounds to 2 decimal places (about 1 km): enough for distance search, no more. */
export function coarse(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
