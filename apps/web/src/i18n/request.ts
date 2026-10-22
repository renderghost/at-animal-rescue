import { getRequestConfig } from 'next-intl/server';
import { defaultLocale } from './config';

// Single locale for the MVP. Locale negotiation (cookie or Accept-Language) slots in here.
export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
