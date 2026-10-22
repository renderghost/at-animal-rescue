import { describe, expect, it } from 'vitest';
import { distanceUnit, formatDistance } from './format';

describe('distanceUnit', () => {
  it('uses miles for British English', () => {
    expect(distanceUnit('en-GB')).toBe('mile');
  });

  it('uses kilometres for continental European locales', () => {
    expect(distanceUnit('nl-NL')).toBe('kilometer');
    expect(distanceUnit('de')).toBe('kilometer');
    expect(distanceUnit('fr-FR')).toBe('kilometer');
  });
});

describe('formatDistance', () => {
  it('converts kilometres to miles for en-GB', () => {
    expect(formatDistance(16.09344, 'en-GB')).toBe('10 mi');
  });

  it('keeps one decimal for short distances', () => {
    expect(formatDistance(2.5, 'de-DE')).toBe('2,5 km');
  });

  it('rounds longer distances', () => {
    expect(formatDistance(42.4, 'nl-NL')).toBe('42 km');
  });
});
