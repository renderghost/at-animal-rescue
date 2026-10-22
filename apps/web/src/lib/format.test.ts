import { describe, expect, it } from 'vitest';
import { distanceUnit, formatDistance, formatLocale } from './format';

describe('distanceUnit', () => {
  it('uses miles in the UK and kilometres elsewhere', () => {
    expect(distanceUnit('GB')).toBe('mile');
    expect(distanceUnit('NL')).toBe('kilometer');
    expect(distanceUnit('IE')).toBe('kilometer');
  });

  it('defaults to kilometres when the country is unknown', () => {
    expect(distanceUnit(undefined)).toBe('kilometer');
  });

  it('lets the user override the country default', () => {
    expect(distanceUnit('GB', 'kilometer')).toBe('kilometer');
    expect(distanceUnit('NL', 'mile')).toBe('mile');
  });
});

describe('formatLocale', () => {
  it('combines language and country independently', () => {
    expect(formatLocale('en', 'NL')).toBe('en-NL');
    expect(formatLocale('en', 'DE')).toBe('en-DE');
  });

  it('falls back to British English without a country', () => {
    expect(formatLocale('en', undefined)).toBe('en-GB');
  });
});

describe('formatDistance', () => {
  it('converts kilometres to miles', () => {
    expect(formatDistance(16.09344, 'mile', 'en-GB')).toBe('10 mi');
  });

  it("follows the country's number conventions, whatever the language", () => {
    expect(formatDistance(2.5, 'kilometer', 'en-GB')).toBe('2.5 km');
    expect(formatDistance(2.5, 'kilometer', 'en-NL')).toBe('2,5 km');
  });

  it('keeps unit choice independent of number conventions', () => {
    expect(formatDistance(2.5, 'mile', 'en-NL')).toBe('1,6 mi');
  });

  it('rounds longer distances', () => {
    expect(formatDistance(42.4, 'kilometer', 'en-NL')).toBe('42 km');
  });
});
