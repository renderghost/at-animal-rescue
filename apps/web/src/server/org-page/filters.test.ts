import { describe, expect, it } from 'vitest';
import { filtersToQuery, hasFilters, parseOrgFilters } from './filters';

describe('parseOrgFilters', () => {
  it('reads repeated and single values, ignoring unknown ones', () => {
    const filters = parseOrgFilters({
      species: ['rabbit', 'dragon'],
      size: 'small',
      age: ['senior'],
      together: 'bonded',
      stated: ['children', 'unicorns'],
      cursor: 'abc',
    });
    expect(filters).toEqual({
      species: ['rabbit'],
      sizes: ['small'],
      ageGroups: ['senior'],
      bonded: true,
      criteria: ['children'],
      cursor: 'abc',
    });
    expect(hasFilters(filters)).toBe(true);
  });

  it('treats no filters as none, and "single" as not bonded', () => {
    expect(hasFilters(parseOrgFilters({}))).toBe(false);
    expect(parseOrgFilters({ together: 'single' }).bonded).toBe(false);
    expect(parseOrgFilters({ together: 'either' }).bonded).toBeUndefined();
  });
});

describe('filtersToQuery', () => {
  it('round-trips through the query string, with a new cursor', () => {
    const filters = parseOrgFilters({
      species: ['cat', 'dog'],
      together: 'single',
      stated: 'flat',
    });
    const query = filtersToQuery(filters, 'next');
    expect(query).toBe('?species=dog&species=cat&together=single&stated=flat&cursor=next');
    const params = Object.fromEntries(
      [...new URLSearchParams(query).keys()].map((key) => [
        key,
        new URLSearchParams(query).getAll(key),
      ]),
    );
    expect(parseOrgFilters(params)).toEqual({ ...filters, cursor: 'next' });
    expect(filtersToQuery(parseOrgFilters({}))).toBe('');
  });
});
