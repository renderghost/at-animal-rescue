/**
 * Language and country are independent: any language can be used in any country.
 * - Language picks the message catalogue and the language of the content.
 * - Country picks defaults such as distance units and feeds number/date formatting.
 */
export const languages = ['en'] as const;
export type Language = (typeof languages)[number];
export const defaultLanguage: Language = 'en';

/** BCP 47 tag describing the content of each catalogue (our English is British English). */
export const contentLanguageTag: Record<Language, string> = {
  en: 'en-GB',
};

/** Language names in their own language, for the switcher. */
export const languageNames: Record<Language, string> = {
  en: 'English',
};

export const COOKIES = {
  language: 'hw_lang',
  country: 'hw_country',
  units: 'hw_units',
} as const;

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (languages as readonly string[]).includes(value);
}
