import { describe, expect, it, vi } from 'vitest';
import { GeocoderUnavailableError } from './geocoder';
import { NominatimGeocoder } from './nominatim';

const utrecht = {
  lat: '52.0907006',
  lon: '5.1215634',
  display_name: 'Utrecht, Nederland',
  address: { city: 'Utrecht', state: 'Utrecht', country: 'Nederland', country_code: 'nl' },
};

function setup(responses: unknown[] = [[utrecht]], options = {}) {
  let clock = 0;
  const sleeps: number[] = [];
  const fetch = vi.fn(async (url: URL | RequestInfo) => {
    void url;
    const body = responses.shift() ?? [];
    if (body instanceof Error) throw body;
    if (typeof body === 'number') return new Response('', { status: body });
    return Response.json(body);
  });
  const geocoder = new NominatimGeocoder({
    contact: 'ops@homeward.example',
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...options,
  });
  return { geocoder, fetch, sleeps, advance: (ms: number) => (clock += ms) };
}

describe('NominatimGeocoder', () => {
  it('returns places with coordinates rounded to about 1 km', async () => {
    const { geocoder } = setup();
    expect(await geocoder.search({ text: 'Utrecht', country: 'NL', language: 'en' })).toEqual([
      {
        label: 'Utrecht, Utrecht, Nederland',
        locality: 'Utrecht',
        region: 'Utrecht',
        country: 'NL',
        latitude: '52.09',
        longitude: '5.12',
      },
    ]);
  });

  it('sends only the place name with country and language hints, and identifies itself', async () => {
    const { geocoder, fetch } = setup();
    await geocoder.search({ text: '  Utrecht   centrum ', country: 'NL', language: 'en' });
    const [url, init] = fetch.mock.calls[0]! as unknown as [URL, RequestInit];
    expect(url.origin).toBe('https://nominatim.openstreetmap.org');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'Utrecht centrum',
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      featureType: 'settlement',
      countrycodes: 'nl',
      'accept-language': 'en',
    });
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(
      'Homeward/0.1 (ops@homeward.example)',
    );
  });

  it('looks up postcodes as postcodes, falling back to a free-text search', async () => {
    const district = {
      lat: '51.5010',
      lon: '-0.1416',
      display_name: 'SW1A, London, England, United Kingdom',
      address: {
        postcode: 'SW1A',
        state: 'England',
        country: 'United Kingdom',
        country_code: 'gb',
      },
    };
    const { geocoder, fetch } = setup([[], [district]]);
    expect(await geocoder.search({ text: 'SW1A', country: 'GB' })).toEqual([
      {
        label: 'SW1A, England, United Kingdom',
        locality: 'SW1A',
        region: 'England',
        country: 'GB',
        latitude: '51.50',
        longitude: '-0.14',
      },
    ]);
    const params = fetch.mock.calls.map(([url]) => Object.fromEntries((url as URL).searchParams));
    expect(params[0]).toMatchObject({ postalcode: 'SW1A', countrycodes: 'gb' });
    expect(params[0]).not.toHaveProperty('featureType');
    expect(params[1]).toMatchObject({ q: 'SW1A', countrycodes: 'gb' });
    expect(params[1]).not.toHaveProperty('featureType');
  });

  it('serves repeats from the cache, ignoring case and spacing', async () => {
    const { geocoder, fetch } = setup();
    await geocoder.search({ text: 'Utrecht', country: 'NL' });
    await geocoder.search({ text: ' utrecht ', country: 'nl' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('expires cached results', async () => {
    const { geocoder, fetch, advance } = setup([[utrecht], [utrecht]], { cacheTtlMs: 1000 });
    await geocoder.search({ text: 'Utrecht' });
    advance(1001);
    await geocoder.search({ text: 'Utrecht' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('makes at most one request a second', async () => {
    const { geocoder, sleeps } = setup([[utrecht], [utrecht], [utrecht]]);
    await Promise.all([
      geocoder.search({ text: 'Utrecht' }),
      geocoder.search({ text: 'Amsterdam' }),
      geocoder.search({ text: 'Rotterdam' }),
    ]);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('skips results without a town or country, and de-duplicates labels', async () => {
    const { geocoder } = setup([
      [
        utrecht,
        { ...utrecht, lat: '52.1' },
        { lat: '1', lon: '1', display_name: 'Sea', address: {} },
      ],
    ]);
    expect(await geocoder.search({ text: 'Utrecht' })).toHaveLength(1);
  });

  it('ignores very short queries without calling Nominatim', async () => {
    const { geocoder, fetch } = setup();
    expect(await geocoder.search({ text: 'U' })).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports outages and keeps working afterwards', async () => {
    const { geocoder } = setup([503, new Error('offline'), [utrecht]]);
    await expect(geocoder.search({ text: 'Utrecht' })).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
    await expect(geocoder.search({ text: 'Utrecht' })).rejects.toBeInstanceOf(
      GeocoderUnavailableError,
    );
    expect(await geocoder.search({ text: 'Utrecht' })).toHaveLength(1);
  });

  it('requires a contact for the User-Agent', () => {
    expect(() => new NominatimGeocoder({ contact: ' ' })).toThrow('contact');
  });
});
