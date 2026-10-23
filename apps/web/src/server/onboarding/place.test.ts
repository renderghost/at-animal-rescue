import { describe, expect, it } from 'vitest';
import { GeocoderUnavailableError, type GeocodedPlace } from '../geocode/geocoder';
import { locate, resolvePlace } from './place';

const place = (locality: string, region: string): GeocodedPlace => ({
  label: `${locality}, ${region}, Nederland`,
  locality,
  region,
  country: 'NL',
  latitude: '52.09',
  longitude: '5.12',
});

const geocoder = (results: GeocodedPlace[] | Error) => ({
  search: async () => {
    if (results instanceof Error) throw results;
    return results;
  },
});

describe('resolvePlace', () => {
  it('finds the single town with that name, ignoring case and accents', async () => {
    const result = await resolvePlace(
      geocoder([place('Utrecht', 'Utrecht'), place('Zeist', 'Utrecht')]),
      {
        locality: 'utrecht',
        country: 'NL',
      },
    );
    expect(result).toEqual({ kind: 'found', place: place('Utrecht', 'Utrecht') });
    expect(
      await resolvePlace(geocoder([place('Zürich', 'Zürich')]), {
        locality: 'Zurich',
        country: 'CH',
      }),
    ).toMatchObject({ kind: 'found' });
  });

  it('asks the person to choose between towns with the same name', async () => {
    const both = [place('Bergen', 'Noord-Holland'), place('Bergen', 'Limburg')];
    expect(await resolvePlace(geocoder(both), { locality: 'Bergen', country: 'NL' })).toEqual({
      kind: 'ambiguous',
      choices: both,
    });
    expect(
      await resolvePlace(geocoder(both), {
        locality: 'Bergen',
        country: 'NL',
        chosen: 'Bergen, Limburg, Nederland',
      }),
    ).toEqual({ kind: 'found', place: both[1] });
  });

  it('offers what the geocoder found under another name', async () => {
    expect(
      await resolvePlace(geocoder([place('Den Haag', 'Zuid-Holland')]), {
        locality: 'The Hague',
        country: 'NL',
      }),
    ).toMatchObject({ kind: 'ambiguous', choices: [{ locality: 'Den Haag' }] });
  });

  it('reports nothing found, or the geocoder being down', async () => {
    expect(await resolvePlace(geocoder([]), { locality: 'Nowhere', country: 'NL' })).toEqual({
      kind: 'notFound',
    });
    expect(
      await resolvePlace(geocoder(new GeocoderUnavailableError('down')), {
        locality: 'Utrecht',
        country: 'NL',
      }),
    ).toEqual({ kind: 'unavailable' });
  });

  it('ignores a stale choice that no longer matches a result', async () => {
    expect(
      await resolvePlace(geocoder([place('Utrecht', 'Utrecht')]), {
        locality: 'Utrecht',
        country: 'NL',
        chosen: 'Somewhere else',
      }),
    ).toMatchObject({ kind: 'found', place: { locality: 'Utrecht' } });
  });
});

describe('resolvePlace with postcodes', () => {
  it('takes a single result for a postcode, whatever its town is called', async () => {
    const result = await resolvePlace(geocoder([place('Utrecht', 'Utrecht')]), {
      locality: '3511',
      country: 'NL',
    });
    expect(result).toEqual({ kind: 'found', place: place('Utrecht', 'Utrecht') });
  });
});

describe('locate', () => {
  const utrecht = { locality: 'Utrecht', country: 'NL' };
  const failing = { search: async () => expect.fail('should not geocode') };

  it('keeps the coordinates when the place has not changed', async () => {
    const previous = { ...utrecht, latitude: '52.09', longitude: '5.12' };
    expect(await locate(failing, { ...utrecht, locality: 'utrecht' }, { previous })).toEqual({
      kind: 'located',
      coordinates: { latitude: '52.09', longitude: '5.12' },
    });
  });

  it('looks the place up again when it has changed', async () => {
    const previous = { locality: 'Zeist', country: 'NL', latitude: '52.09', longitude: '5.23' };
    expect(await locate(geocoder([place('Utrecht', 'Utrecht')]), utrecht, { previous })).toEqual({
      kind: 'located',
      coordinates: { latitude: '52.09', longitude: '5.12' },
    });
  });

  it('asks for a choice, or says why there are no coordinates', async () => {
    const both = [place('Bergen', 'Noord-Holland'), place('Bergen', 'Limburg')];
    expect(await locate(geocoder(both), { locality: 'Bergen', country: 'NL' })).toEqual({
      kind: 'choose',
      choices: both,
    });
    expect(
      await locate(
        geocoder(both),
        { locality: 'Bergen', country: 'NL' },
        { chosen: 'Bergen, Limburg, Nederland' },
      ),
    ).toMatchObject({ kind: 'located', region: 'Limburg' });
    expect(await locate(geocoder([]), utrecht)).toEqual({ kind: 'unlocated', reason: 'notFound' });
    expect(await locate(geocoder(new GeocoderUnavailableError()), utrecht)).toEqual({
      kind: 'unlocated',
      reason: 'unavailable',
    });
  });
});
