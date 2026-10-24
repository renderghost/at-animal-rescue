'use server';

import { cookies } from 'next/headers';
import { COOKIES, isLanguage } from '@/i18n/config';
import { isCountry } from '@/i18n/countries';
import { isUnitsPreference } from '@/lib/format';
import { secureCookies } from '@/server/site';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Saves language, country and units. These are preference cookies set at the user's
 * request, so no consent banner is needed. Empty or "auto" values clear the cookie.
 */
export async function savePreferences(formData: FormData): Promise<void> {
  const store = await cookies();
  const options = {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: secureCookies(),
  };

  const language = formData.get('language');
  if (isLanguage(language)) store.set(COOKIES.language, language, options);

  const country = formData.get('country');
  if (country === '') store.delete(COOKIES.country);
  else if (isCountry(country)) store.set(COOKIES.country, country, options);

  const units = formData.get('units');
  if (units === 'auto') store.delete(COOKIES.units);
  else if (isUnitsPreference(units)) store.set(COOKIES.units, units, options);
}
