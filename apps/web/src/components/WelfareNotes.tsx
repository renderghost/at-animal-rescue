import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import type { BreedWarning } from '@/lib/breed-restrictions';
import { minAgeWeeks } from '@/server/welfare';

/** The welfare rules in brief, at the top of the listing and animal editors (#45). */
export async function WelfareNote({ kind }: { kind: 'listing' | 'animal' }) {
  const t = await getTranslations('Welfare');
  return (
    <p className="mb-6 max-w-prose rounded-md border border-line bg-sunken p-4 text-sm">
      {t.rich(kind === 'listing' ? 'listingNote' : 'animalNote', {
        weeks: minAgeWeeks(),
        link: (chunks) => <Link href="/guidelines">{chunks}</Link>,
      })}
    </p>
  );
}

/**
 * Breeds that may be restricted where a listing is, or where its visitor is (#45). Always
 * "may" and "check the law": the rules haven't been legally reviewed and can change.
 */
export async function BreedWarnings({
  warnings,
  audience,
}: {
  warnings: ReadonlyArray<BreedWarning & { animal: string }>;
  audience: 'organisation' | 'visitor';
}) {
  if (warnings.length === 0) return null;
  const t = await getTranslations('Welfare');
  const taxonomy = await getTranslations('Taxonomy');
  const { language } = await getPreferences();
  const countries = sortedCountries(language);
  const countryName = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  const breedName = (key: string) =>
    taxonomy.has(`breed.dog.${key}` as never) ? taxonomy(`breed.dog.${key}` as never) : key;
  return (
    <section
      aria-labelledby="breed-rules"
      className="mb-8 rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown"
    >
      <h2 id="breed-rules" className="mb-1 font-bold">
        {t('breedHeading')}
      </h2>
      <p className="mb-2">
        {t(audience === 'organisation' ? 'breedOrganisation' : 'breedVisitor')}
      </p>
      <ul className="mb-2 grid list-disc gap-1 pl-6">
        {warnings.map((warning, i) => (
          <li key={i}>
            {t(`level.${warning.level}`, {
              breed: breedName(warning.breed),
              animal: warning.animal,
              country: countryName(warning.country),
              law: warning.law,
            })}{' '}
            <a href={warning.source} rel="noreferrer">
              {t('source')}
            </a>
          </li>
        ))}
      </ul>
      <p className="text-sm">{t('notReviewed')}</p>
    </section>
  );
}
