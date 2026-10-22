export const locales = ['en-GB'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en-GB';
