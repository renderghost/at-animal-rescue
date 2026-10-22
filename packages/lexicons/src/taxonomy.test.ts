import { describe, expect, it } from 'vitest';
import defs from '../lexicons/pet/homeward/defs.json';
import listing from '../lexicons/pet/homeward/listing.json';
import animal from '../lexicons/pet/homeward/animal.json';
import {
  AGE_GROUPS,
  CAT_BREEDS,
  CRITERIA,
  DOG_BREEDS,
  SEXES,
  SIZES,
  SPECIES,
  TRAITS,
} from './taxonomy';

describe('taxonomy matches the lexicons', () => {
  it('species, sizes, age groups and sexes equal the knownValues', () => {
    expect(SPECIES).toEqual(defs.defs.species.knownValues);
    expect(SIZES).toEqual(defs.defs.size.knownValues);
    expect(AGE_GROUPS).toEqual(defs.defs.ageGroup.knownValues);
    expect(SEXES).toEqual(animal.defs.main.record.properties.sex.knownValues);
  });

  it('lists every criterion type in the listing union, and nothing else', () => {
    const union = listing.defs.main.record.properties.criteria.items.refs.map((r) => r.slice(1));
    expect(Object.keys(CRITERIA).sort()).toEqual([...union].sort());
  });
});

describe('taxonomy keys', () => {
  it.each([
    ['dog breeds', DOG_BREEDS],
    ['cat breeds', CAT_BREEDS],
    ['traits', TRAITS],
  ])('%s are unique camelCase keys', (_name, keys) => {
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-zA-Z]*$/);
  });
});
