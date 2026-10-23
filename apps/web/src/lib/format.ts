import { contentLanguageTag, type Language } from '@/i18n/config';

export type DistanceUnit = 'mile' | 'kilometer';
export type UnitsPreference = DistanceUnit | 'auto';

// Countries where road distances are customarily given in miles.
const MILE_COUNTRIES = new Set(['GB', 'US', 'LR', 'MM']);

/** The user's explicit choice wins; otherwise the country's custom, defaulting to kilometres. */
export function distanceUnit(country: string | undefined, preference: UnitsPreference = 'auto') {
  if (preference !== 'auto') return preference;
  return country && MILE_COUNTRIES.has(country) ? 'mile' : 'kilometer';
}

export function isUnitsPreference(value: unknown): value is UnitsPreference {
  return value === 'auto' || value === 'mile' || value === 'kilometer';
}

/**
 * Locale used for number, date and price formatting: the user's language combined with their
 * country (English in the Netherlands → en-NL), so formats follow the country's conventions
 * (1,6 km · 22-10-2026) while the words stay in the chosen language. Without a country, the
 * catalogue's own variant (British English).
 */
export function formatLocale(language: Language, country: string | undefined): string {
  if (!country) return contentLanguageTag[language];
  try {
    return new Intl.Locale(language, { region: country }).toString();
  } catch {
    return contentLanguageTag[language];
  }
}

const KM_PER_MILE = 1.609344;

/** Formats a distance stored in kilometres in the given unit. */
export function formatDistance(km: number, unit: DistanceUnit, locale: string): string {
  const value = unit === 'mile' ? km / KM_PER_MILE : km;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

/** Formats an amount stored in minor units (pence, cents) in its currency. */
export function formatMoney(minorUnits: number, currency: string, locale: string): string {
  try {
    const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    const amount = minorUnits / 10 ** digits;
    // Whole amounts without decimals: "€75", not "€75.00".
    return Number.isInteger(amount)
      ? new Intl.NumberFormat(locale, {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(amount)
      : format.format(amount);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}
