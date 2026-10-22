import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { distanceUnit, formatLocale, isUnitsPreference } from '@/lib/format';
import { COOKIES } from './config';
import { resolveCountry, resolveLanguage } from './negotiate';

/** The visitor's language, country and units for this request. */
export const getPreferences = cache(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const acceptLanguage = headerStore.get('accept-language');
  const savedUnits = cookieStore.get(COOKIES.units)?.value;

  const language = resolveLanguage(cookieStore.get(COOKIES.language)?.value, acceptLanguage);
  const country = resolveCountry(cookieStore.get(COOKIES.country)?.value, acceptLanguage);
  const units = isUnitsPreference(savedUnits) ? savedUnits : 'auto';

  return {
    language,
    country,
    units,
    distanceUnit: distanceUnit(country, units),
    formatLocale: formatLocale(language, country),
  };
});
