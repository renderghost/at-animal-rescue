import { pet } from '@homeward/lexicons';
import { describe, expect, it } from 'vitest';
import { discoverQuery, filtersFromQuery } from './discover-filters';
import { savedSearchFilters, savedSearchRecord, withinChoice } from './saved-search';

const now = new Date('2026-10-24T09:00:00.000Z');
const filters = filtersFromQuery;

describe('saved searches', () => {
  it('keeps every filter but the page, and the lexicon accepts it', () => {
    const query =
      '?species=cat&species=rabbit&size=small&age=young&sex=female&together=single&fee=none&fee=donation&near=Bergen&country=NL&place=Bergen%2C+Noord-Holland&within=25&sort=match&hide=conflicts&page=3';
    const record = savedSearchRecord(filters(query), {
      name: 'Cats near Bergen',
      unit: 'kilometer',
      now,
    });
    expect(record).toEqual({
      name: 'Cats near Bergen',
      species: ['cat', 'rabbit'],
      sizes: ['small'],
      ageGroups: ['young'],
      sexes: ['female'],
      together: 'single',
      fees: ['none', 'donation'],
      near: 'Bergen',
      country: 'NL',
      place: 'Bergen, Noord-Holland',
      maxKm: 25,
      sort: 'bestMatch',
      hideConflicts: true,
      createdAt: '2026-10-24T09:00:00.000Z',
    });
    const parsed = pet.homeward.adopter.savedSearch.$safeParse({
      $type: 'pet.homeward.adopter.savedSearch',
      ...record,
    });
    expect(parsed.success).toBe(true);
    // And back, without the page.
    expect(discoverQuery(savedSearchFilters(record, 'kilometer'))).toBe(
      query.replace('&page=3', ''),
    );
  });

  it('keeps nothing extra for an empty search', () => {
    expect(savedSearchRecord(filters(''), { name: 'Everything', unit: 'kilometer', now })).toEqual({
      name: 'Everything',
      createdAt: '2026-10-24T09:00:00.000Z',
    });
  });

  it('stores distance in km and gives it back in the adopter’s unit', () => {
    const record = savedSearchRecord(filters('?within=25'), { name: 'n', unit: 'mile', now });
    expect(record.maxKm).toBe(40);
    expect(savedSearchFilters(record, 'mile').within).toBe(25);
    expect(savedSearchFilters(record, 'kilometer').within).toBe(50);
    expect(withinChoice(100, 'kilometer')).toBe(100);
    expect(withinChoice(5000, 'kilometer')).toBe(250);
  });

  it('reads older and unknown values as the URL would', () => {
    const older = { name: 'Old', bondedOnly: true, createdAt: now.toISOString() } as never;
    expect(savedSearchFilters(older, 'kilometer').bonded).toBe(true);
    const odd = {
      name: 'Odd',
      species: ['dragon', 'cat'],
      fees: ['barter'],
      sort: 'cheapest',
      country: 'nl',
      createdAt: now.toISOString(),
    };
    const read = savedSearchFilters(odd as never, 'kilometer');
    expect(read).toMatchObject({ species: ['cat'], fees: [] });
    expect(read.sort).toBeUndefined();
    // A country only counts with a typed place.
    expect(discoverQuery(savedSearchFilters(odd as never, 'kilometer'))).toBe('?species=cat');
  });
});
