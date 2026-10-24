import 'server-only';
import { BREEDS } from '@homeward/lexicons/taxonomy';
import { getTranslations } from 'next-intl/server';
import { getPreferences } from '@/i18n/preferences';
import { breedWarnings, type BreedWarning } from '@/lib/breed-restrictions';
import { DEFAULT_MIN_AGE_WEEKS, listableFrom } from '@/lib/welfare';
import type { AnimalRecord } from './animals/animal-form';
import { getCurrentUser } from './auth/session';
import { getCurrentRole } from './onboarding/current-role';
import { getPrivateStore } from './private-store';

/** The minimum age for puppies and kittens, in weeks: WELFARE_MIN_AGE_WEEKS, or 8. */
export function minAgeWeeks(): number {
  const weeks = Number(process.env.WELFARE_MIN_AGE_WEEKS);
  return Number.isInteger(weeks) && weeks > 0 ? weeks : DEFAULT_MIN_AGE_WEEKS;
}

/** The puppies and kittens in a listing that are too young to list yet, and from when. */
export function tooYoung(
  animals: ReadonlyArray<Pick<AnimalRecord, 'name' | 'species' | 'birth'>>,
  now = new Date(),
): Array<{ name: string; from: Date }> {
  const minWeeks = minAgeWeeks();
  return animals.flatMap((animal) => {
    const from = listableFrom(animal, { minWeeks, now });
    return from ? [{ name: animal.name, from }] : [];
  });
}

/** English breed names by key, for matching breeds an organisation typed in. */
async function dogBreedNames(): Promise<Record<string, string>> {
  const t = await getTranslations('Taxonomy');
  return Object.fromEntries(
    (BREEDS.dog ?? []).map((key) => [key, t(`breed.dog.${key}` as never) as string]),
  );
}

/** Breed warnings for a listing's dogs in the given countries. */
export async function listingBreedWarnings(
  animals: ReadonlyArray<Pick<AnimalRecord, 'name' | 'species' | 'breeds'>>,
  countries: ReadonlyArray<string | undefined>,
): Promise<Array<BreedWarning & { animal: string }>> {
  const names = await dogBreedNames();
  return animals
    .filter((animal) => animal.species === 'dog' && animal.breeds?.length)
    .flatMap((animal) =>
      breedWarnings(animal.breeds!, countries, names).map((warning) => ({
        ...warning,
        animal: animal.name,
      })),
    );
}

/**
 * Where the visitor is, for breed warnings (#45): a signed-in adopter's private location,
 * and the country they chose under Language and region. Used only on the server.
 */
export async function viewerCountries(): Promise<string[]> {
  const { country } = await getPreferences();
  const user = await getCurrentUser();
  const location =
    user && (await getCurrentRole()) === 'adopter'
      ? await getPrivateStore().get(user.did, 'pet.homeward.adopter.location', 'self')
      : undefined;
  return [...new Set([location?.country, country].filter((c): c is string => Boolean(c)))];
}
