/**
 * The listing editor's criteria, fee and limits, shared by the server-side parser and the
 * editor (kept free of dependencies for the browser bundle).
 */

export const LISTING_LIMITS = {
  animals: 10,
  title: 100,
  summary: 300,
  description: 300,
  childMinAge: 17,
  maxHours: 24,
  maxKm: 5000,
  minVisits: 2,
  maxVisits: 20,
  /** In whole currency units, to catch typos such as an extra zero or two. */
  maxFee: 100_000,
} as const;

/** The radio value for a criterion that doesn't matter: it's left out of the listing. */
export const ANY_LEVEL = 'any';
export const LEVELS = [ANY_LEVEL, 'preferred', 'required'] as const;

/**
 * One editor row per criterion, grouped as in spec §5. "Living with dogs, cats or small
 * animals" are three rows of the lexicon's one otherAnimalsCriterion.
 */
export const CRITERIA_GROUPS = [
  { group: 'household', rows: ['children', 'dogs', 'cats', 'smallAnimals', 'experience'] },
  { group: 'home', rows: ['homeType', 'garden', 'setting', 'stepFree', 'landlordPermission'] },
  { group: 'care', rows: ['timeAlone', 'medicalCare', 'specialDiet', 'behaviouralSupport'] },
  { group: 'logistics', rows: ['distance', 'homeVisit', 'multipleVisits'] },
] as const;

export type CriterionRow = (typeof CRITERIA_GROUPS)[number]['rows'][number];

/** The other animal each "Living with …" row is about. */
export const OTHER_ANIMAL_ROWS = { dogs: 'dog', cats: 'cat', smallAnimals: 'smallAnimal' } as const;

export const EXPERIENCE = ['none', 'some', 'experienced'] as const;
export const HOME_TYPES = ['flat', 'house'] as const;
export const SETTINGS = ['urban', 'suburban', 'rural'] as const;
export const FEE_KINDS = ['none', 'donation', 'fee'] as const;

/** Currencies offered for adoption fees: the euro and Europe's other currencies. */
export const CURRENCIES = [
  'EUR',
  'GBP',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'ISK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'RSD',
  'BAM',
  'MKD',
  'ALL',
  'MDL',
  'UAH',
  'TRY',
] as const;

const COUNTRY_CURRENCY: Record<string, (typeof CURRENCIES)[number]> = {
  GB: 'GBP',
  GG: 'GBP',
  JE: 'GBP',
  IM: 'GBP',
  CH: 'CHF',
  LI: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  FO: 'DKK',
  IS: 'ISK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  RS: 'RSD',
  BA: 'BAM',
  MK: 'MKD',
  AL: 'ALL',
  MD: 'MDL',
  UA: 'UAH',
  TR: 'TRY',
};

/** The usual currency in a country, defaulting to the euro. */
export function currencyFor(country: string | undefined): string {
  return (country && COUNTRY_CURRENCY[country]) || 'EUR';
}

/** Digits after the decimal point in a currency's minor unit (2 for EUR, 0 for ISK). */
export function minorDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}
