import { describe, expect, it } from 'vitest';
import { AGE_THRESHOLDS, ageGroupOf, birthDateRange, parseBirthDate } from './age';
import { SPECIES } from './taxonomy';

const now = new Date('2026-10-22T12:00:00Z');

describe('parseBirthDate', () => {
  it('uses the middle of partial dates', () => {
    expect(parseBirthDate('2024')?.toISOString()).toBe('2024-07-01T00:00:00.000Z');
    expect(parseBirthDate('2024-03')?.toISOString()).toBe('2024-03-15T00:00:00.000Z');
    expect(parseBirthDate('2024-03-09')?.toISOString()).toBe('2024-03-09T00:00:00.000Z');
  });

  it('rejects malformed and impossible dates', () => {
    for (const value of [undefined, '', '24', '2024-13', '2024-02-31', 'March 2024']) {
      expect(parseBirthDate(value)).toBeUndefined();
    }
  });
});

describe('ageGroupOf', () => {
  it.each([
    ['dog', '2025-06', 'young'],
    ['dog', '2021-01', 'adult'],
    ['dog', '2017-01', 'senior'],
    ['cat', '2016-01', 'adult'],
    ['cat', '2015-01', 'senior'],
    ['rabbit', '2021-06', 'senior'],
    ['hamster', '2026-07', 'young'],
    ['hamster', '2025-01', 'senior'],
    ['rat', '2025-06', 'adult'],
  ])('%s born %s is %s', (species, born, group) => {
    expect(ageGroupOf(species, born, now)).toBe(group);
  });

  it('is undefined without thresholds, a usable date, or for future births', () => {
    expect(ageGroupOf('other', '2020', now)).toBeUndefined();
    expect(ageGroupOf('dog', undefined, now)).toBeUndefined();
    expect(ageGroupOf('dog', '2027-01', now)).toBeUndefined();
  });

  it('has thresholds for every species except "other", with young before senior', () => {
    for (const species of SPECIES.filter((s) => s !== 'other')) {
      const t = AGE_THRESHOLDS[species];
      expect(t.youngUnder).toBeLessThan(t.seniorFrom);
    }
  });
});

describe('birthDateRange', () => {
  it('agrees with ageGroupOf at every month for every species', () => {
    for (const species of Object.keys(AGE_THRESHOLDS)) {
      for (let months = 0; months <= 20 * 12; months += 1) {
        const born = new Date(now.getTime() - months * 30.44 * 86_400_000);
        const value = born.toISOString().slice(0, 10);
        const group = ageGroupOf(species, value, now)!;
        const range = birthDateRange(species, group, now)!;
        const date = parseBirthDate(value)!;
        expect(!range.after || date > range.after, `${species} ${value} ${group}`).toBe(true);
        expect(!range.before || date <= range.before, `${species} ${value} ${group}`).toBe(true);
      }
    }
  });

  it('has no range for species without thresholds', () => {
    expect(birthDateRange('other', 'senior', now)).toBeUndefined();
  });
});
