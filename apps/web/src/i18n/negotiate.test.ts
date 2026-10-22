import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES } from './countries';
import { parseAcceptLanguage, resolveCountry, resolveLanguage } from './negotiate';

describe('parseAcceptLanguage', () => {
  it('orders tags by quality, keeping header order for ties', () => {
    expect(parseAcceptLanguage('nl-NL,nl;q=0.9,en;q=0.8,de;q=0.9')).toEqual([
      'nl-NL',
      'nl',
      'de',
      'en',
    ]);
  });

  it('drops wildcards, zero-quality tags and empty headers', () => {
    expect(parseAcceptLanguage('*, fr;q=0, en')).toEqual(['en']);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe('resolveLanguage', () => {
  it('prefers the saved choice', () => {
    expect(resolveLanguage('en', 'fr-FR')).toBe('en');
  });

  it('matches a regional browser tag to its language', () => {
    expect(resolveLanguage(undefined, 'fr-FR, en-US;q=0.5')).toBe('en');
  });

  it('ignores unsupported saved values and falls back to English', () => {
    expect(resolveLanguage('xx', 'fr-FR')).toBe('en');
  });
});

describe('resolveCountry', () => {
  it('prefers the saved choice, whatever the language', () => {
    expect(resolveCountry('NL', 'en-GB')).toBe('NL');
    expect(resolveCountry('nl', null)).toBe('NL');
  });

  it('guesses from the browser locale region', () => {
    expect(resolveCountry(undefined, 'en-GB,en;q=0.9')).toBe('GB');
    expect(resolveCountry(undefined, 'en,nl-BE;q=0.8')).toBe('BE');
  });

  it('is undefined when nothing indicates a country', () => {
    expect(resolveCountry(undefined, 'en')).toBeUndefined();
    expect(resolveCountry('ZZ', null)).toBeUndefined();
  });
});

describe('COUNTRY_CODES', () => {
  it('lists every ISO 3166-1 alpha-2 code once', () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
  });
});
