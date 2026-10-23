import { describe, expect, it } from 'vitest';
import { discoverQuery, parseDiscoverFilters } from './discover-filters';

describe('discover filters', () => {
  it('reads known values and ignores the rest', () => {
    const filters = parseDiscoverFilters({
      species: ['dog', 'dragon'],
      size: 'small',
      age: ['young'],
      sex: 'female',
      together: 'bonded',
      fee: ['none', 'free'],
      near: ' Utrecht ',
      country: 'nl',
      within: '25',
      sort: 'match',
      hide: 'conflicts',
      page: '3',
    });
    expect(filters).toEqual({
      species: ['dog'],
      sizes: ['small'],
      ageGroups: ['young'],
      sexes: ['female'],
      bonded: true,
      fees: ['none'],
      near: 'Utrecht',
      country: 'NL',
      within: 25,
      sort: 'match',
      hideConflicts: true,
      page: 3,
    });
    expect(parseDiscoverFilters({ within: '37', sort: 'random', page: '-2' })).toMatchObject({
      page: 1,
    });
    expect(parseDiscoverFilters({ within: '37', sort: 'random' })).not.toHaveProperty('within');
  });

  it('writes the same filters back, with paging replaced', () => {
    const filters = parseDiscoverFilters({
      species: 'cat',
      near: 'Bergen',
      place: 'Bergen, Limburg',
      cursor: 'abc',
    });
    const query = discoverQuery(filters, { page: 2 });
    expect(query).toBe('?species=cat&near=Bergen&place=Bergen%2C+Limburg&page=2');
    expect(parseDiscoverFilters(Object.fromEntries(new URLSearchParams(query)))).toMatchObject({
      species: ['cat'],
      near: 'Bergen',
      page: 2,
    });
    expect(discoverQuery(parseDiscoverFilters({}))).toBe('');
  });
});
