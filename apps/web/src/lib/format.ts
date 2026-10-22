// Countries where road distances are customarily given in miles.
const MILE_REGIONS = new Set(['GB', 'US', 'LR', 'MM']);

export type DistanceUnit = 'mile' | 'kilometer';

export function distanceUnit(locale: string): DistanceUnit {
  const region = new Intl.Locale(locale).maximize().region;
  return region && MILE_REGIONS.has(region) ? 'mile' : 'kilometer';
}

const KM_PER_MILE = 1.609344;

/** Formats a distance stored in kilometres using the locale's customary unit. */
export function formatDistance(km: number, locale: string): string {
  const unit = distanceUnit(locale);
  const value = unit === 'mile' ? km / KM_PER_MILE : km;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}
