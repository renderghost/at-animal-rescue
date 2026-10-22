import {
  coarse,
  GeocoderUnavailableError,
  type GeocodedPlace,
  type GeocodeQuery,
  type Geocoder,
} from './geocoder';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string | undefined>;
}

export interface NominatimOptions {
  /** Contact email or URL for the User-Agent, required by the usage policy. */
  contact: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Minimum gap between requests (policy: at most 1 request a second). */
  minIntervalMs?: number;
  cacheSize?: number;
  cacheTtlMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const LOCALITY_KEYS = ['city', 'town', 'village', 'municipality', 'hamlet', 'suburb'] as const;
const REGION_KEYS = ['state', 'province', 'county', 'region'] as const;

/**
 * OpenStreetMap Nominatim, following its usage policy: an identifying User-Agent, at most
 * one request a second from this process, and cached results so repeats don't hit it.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
export class NominatimGeocoder implements Geocoder {
  private readonly cache = new Map<string, { expires: number; places: GeocodedPlace[] }>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequest = -Infinity;
  private readonly fetch: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: NominatimOptions) {
    if (!options.contact.trim()) throw new Error('Nominatim needs a contact for its User-Agent.');
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async search({ text, country, language }: GeocodeQuery): Promise<GeocodedPlace[]> {
    const q = text.trim().replace(/\s+/g, ' ');
    if (q.length < 2) return [];
    const key = [q.toLowerCase(), country?.toLowerCase() ?? '', language ?? ''].join('|');
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) return cached.places;

    const places = await this.throttled(() => this.request(q, country, language));
    this.remember(key, places);
    return places;
  }

  private async request(q: string, country?: string, language?: string): Promise<GeocodedPlace[]> {
    const url = new URL('/search', this.options.baseUrl ?? 'https://nominatim.openstreetmap.org');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '5');
    url.searchParams.set('featureType', 'settlement');
    if (country) url.searchParams.set('countrycodes', country.toLowerCase());
    if (language) url.searchParams.set('accept-language', language);

    let response: Response;
    try {
      response = await this.fetch(url, {
        headers: { 'User-Agent': `Homeward/0.1 (${this.options.contact})` },
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      throw new GeocoderUnavailableError('Nominatim unreachable', { cause: err });
    }
    if (!response.ok) throw new GeocoderUnavailableError(`Nominatim responded ${response.status}`);

    const results = (await response.json()) as NominatimResult[];
    const places = results.flatMap((result) => toPlace(result) ?? []);
    // Different OSM objects can describe the same town; keep one per label.
    return [...new Map(places.map((place) => [place.label, place])).values()];
  }

  /** Serialises requests and spaces them at least minIntervalMs apart. */
  private throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequest + (this.options.minIntervalMs ?? 1000) - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequest = this.now();
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private remember(key: string, places: GeocodedPlace[]): void {
    const maxSize = this.options.cacheSize ?? 1000;
    if (this.cache.size >= maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, {
      expires: this.now() + (this.options.cacheTtlMs ?? 30 * 24 * 60 * 60 * 1000),
      places,
    });
  }
}

function toPlace(result: NominatimResult): GeocodedPlace | undefined {
  const address = result.address ?? {};
  const locality = LOCALITY_KEYS.map((k) => address[k]).find(Boolean);
  const country = address.country_code?.toUpperCase();
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!locality || !country || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }
  const region = REGION_KEYS.map((k) => address[k]).find(Boolean);
  return {
    label: [locality, region, address.country].filter(Boolean).join(', '),
    locality,
    ...(region && { region }),
    country,
    latitude: coarse(latitude),
    longitude: coarse(longitude),
  };
}
