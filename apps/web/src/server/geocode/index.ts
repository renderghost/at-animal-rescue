import 'server-only';
import type { Geocoder } from './geocoder';
import { NominatimGeocoder } from './nominatim';

export * from './geocoder';

const cache = globalThis as unknown as { homewardGeocoder?: Geocoder };

/** The configured geocoder (one per process, so the rate limit and cache are shared). */
export function getGeocoder(): Geocoder {
  if (!cache.homewardGeocoder) {
    const contact = process.env.NOMINATIM_CONTACT;
    if (!contact) throw new Error('NOMINATIM_CONTACT is not set (see .env.example).');
    cache.homewardGeocoder = new NominatimGeocoder({
      contact,
      baseUrl: process.env.NOMINATIM_URL || undefined,
    });
  }
  return cache.homewardGeocoder;
}
