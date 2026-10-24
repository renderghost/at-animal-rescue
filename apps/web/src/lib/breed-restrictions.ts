/**
 * Dog breeds restricted by country (#45). Warnings only, never a verdict: the lists come
 * from public sources and **have not been legally reviewed** (see #11), laws change, and
 * many also cover crosses and look-alike "types" that a breed name can't capture.
 */

export type RestrictionLevel = 'banned' | 'restricted' | 'noImport';

export interface BreedRule {
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** banned: can't be kept or rehomed; restricted: a licence or conditions apply;
   *  noImport: can't be brought into the country. */
  level: RestrictionLevel;
  breeds: readonly string[];
  law: string;
  /** Where the list comes from, for anyone to check. */
  source: string;
}

export const BREED_RULES: readonly BreedRule[] = [
  {
    country: 'GB',
    level: 'banned',
    breeds: [
      'americanPitBullTerrier',
      'tosaInu',
      'dogoArgentino',
      'filaBrasileiro',
      'americanBully',
    ],
    law: 'Dangerous Dogs Act 1991 (XL Bully type from 2024)',
    source:
      'https://www.cornwall.gov.uk/environment/animal-welfare-and-enforcement/banned-dog-breeds-in-the-uk/',
  },
  {
    country: 'IE',
    level: 'banned',
    breeds: ['americanBully'],
    law: 'Ban on XL Bully dogs (2024)',
    source:
      'https://www.gov.ie/en/department-of-agriculture-food-and-the-marine/publications/ban-on-xl-bully-dogs/',
  },
  {
    country: 'IE',
    level: 'restricted',
    breeds: [
      'americanPitBullTerrier',
      'bullTerrier',
      'staffordshireBullTerrier',
      'bullmastiff',
      'dobermann',
      'germanShepherd',
      'rhodesianRidgeback',
      'rottweiler',
      'akita',
      'tosaInu',
    ],
    law: 'Control of Dogs Regulations 1998',
    source:
      'https://www.gov.ie/en/department-of-agriculture-food-and-the-marine/policy-information/dog-control/',
  },
  {
    country: 'DK',
    level: 'banned',
    breeds: [
      'americanPitBullTerrier',
      'tosaInu',
      'americanStaffordshireTerrier',
      'filaBrasileiro',
      'dogoArgentino',
      'americanBulldog',
      'boerboel',
      'kangal',
      'centralAsianShepherd',
      'caucasianShepherd',
      'southRussianShepherd',
      'tornjak',
      'sarplaninac',
    ],
    law: 'Hundeloven (Danish Act on Dogs), section 1 a',
    source: 'https://en.foedevarestyrelsen.dk/animals/animal-welfare/danish-legislation-on-dogs',
  },
  {
    country: 'NO',
    level: 'banned',
    breeds: [
      'americanPitBullTerrier',
      'americanStaffordshireTerrier',
      'filaBrasileiro',
      'tosaInu',
      'dogoArgentino',
      'czechoslovakianWolfdog',
    ],
    law: 'Hundeloven (Norwegian Dog Act)',
    source: 'https://mattilsynet.no/en/animals/banned-dogs',
  },
  {
    country: 'DE',
    level: 'noImport',
    breeds: [
      'americanPitBullTerrier',
      'americanStaffordshireTerrier',
      'staffordshireBullTerrier',
      'bullTerrier',
    ],
    law: 'Hundeverbringungs- und -einfuhrbeschränkungsgesetz, section 2 (federal states add their own rules)',
    source: 'https://www.gesetze-im-internet.de/hundverbreinfg/__2.html',
  },
  {
    country: 'FR',
    level: 'restricted',
    breeds: [
      'americanStaffordshireTerrier',
      'americanPitBullTerrier',
      'boerboel',
      'tosaInu',
      'rottweiler',
    ],
    law: 'Category 1 and 2 dogs (Code rural, article L211-12)',
    source: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F1838',
  },
  {
    country: 'ES',
    level: 'restricted',
    breeds: [
      'americanPitBullTerrier',
      'staffordshireBullTerrier',
      'americanStaffordshireTerrier',
      'rottweiler',
      'dogoArgentino',
      'filaBrasileiro',
      'tosaInu',
      'akita',
    ],
    law: 'Real Decreto 287/2002, annex I',
    source: 'https://boe.es/boe/dias/2002/03/27/pdfs/A12290-12292.pdf',
  },
  {
    country: 'PT',
    level: 'restricted',
    breeds: [
      'filaBrasileiro',
      'dogoArgentino',
      'americanPitBullTerrier',
      'rottweiler',
      'americanStaffordshireTerrier',
      'staffordshireBullTerrier',
      'tosaInu',
    ],
    law: 'Portaria n.º 422/2004',
    source:
      'https://www.cm-penafiel.pt/wp-content/uploads/2016/09/CROP_Legislacao_Portaria422_2004.pdf',
  },
];

export interface BreedWarning {
  breed: string;
  country: string;
  level: RestrictionLevel;
  law: string;
  source: string;
}

const normalise = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/**
 * Warnings for a dog's breeds in the given countries. Breeds are taxonomy keys, or text an
 * organisation typed, matched loosely against the keys and their English names.
 */
export function breedWarnings(
  breeds: readonly string[],
  countries: ReadonlyArray<string | undefined>,
  names: Readonly<Record<string, string>> = {},
): BreedWarning[] {
  const wanted = new Set(countries.filter(Boolean).map((country) => country!.toUpperCase()));
  const keyOf = (breed: string) => {
    const typed = normalise(breed);
    return (
      Object.keys(names).find(
        (key) => normalise(key) === typed || normalise(names[key]!) === typed,
      ) ?? breed
    );
  };
  const keys = breeds.map(keyOf);
  return BREED_RULES.filter((rule) => wanted.has(rule.country)).flatMap((rule) =>
    keys
      .filter((key) => rule.breeds.includes(key))
      .map((breed) => ({
        breed,
        country: rule.country,
        level: rule.level,
        law: rule.law,
        source: rule.source,
      })),
  );
}
