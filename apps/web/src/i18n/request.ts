import { getRequestConfig } from 'next-intl/server';
import { getPreferences } from './preferences';

// Messages follow the language; number and date formatting follow language + country.
export default getRequestConfig(async () => {
  const { language, formatLocale } = await getPreferences();
  return {
    locale: formatLocale,
    messages: (await import(`../../messages/${language}.json`)).default,
  };
});
