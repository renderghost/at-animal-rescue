import {
  AGE_GROUPS,
  CAT_BREEDS,
  CRITERIA,
  CRITERION_GROUPS,
  DOG_BREEDS,
  SEXES,
  SIZES,
  SPECIES,
  TRAITS,
} from '@homeward/lexicons';
import { describe, expect, it } from 'vitest';
import { languages } from '@/i18n/config';

// Every taxonomy key needs a label in every language catalogue.
describe.each(languages)('Taxonomy labels in %s', async (language) => {
  const { Taxonomy } = (await import(`../../messages/${language}.json`)).default;

  it.each([
    ['species', SPECIES, Taxonomy.species],
    ['size', SIZES, Taxonomy.size],
    ['ageGroup', AGE_GROUPS, Taxonomy.ageGroup],
    ['sex', SEXES, Taxonomy.sex],
    ['breed.dog', DOG_BREEDS, Taxonomy.breed.dog],
    ['breed.cat', CAT_BREEDS, Taxonomy.breed.cat],
    ['trait', TRAITS, Taxonomy.trait],
    ['criterionGroup', CRITERION_GROUPS, Taxonomy.criterionGroup],
    ['criterion', Object.keys(CRITERIA), Taxonomy.criterion],
  ])('%s has exactly one non-empty label per key', (_name, keys, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...keys].sort());
    for (const label of Object.values(labels)) expect(label).toMatch(/\S/);
  });
});
