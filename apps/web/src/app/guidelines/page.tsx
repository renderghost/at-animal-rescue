import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { BREED_RULES } from '@/lib/breed-restrictions';
import { minAgeWeeks } from '@/server/welfare';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Guidelines');
  return { title: t('title'), description: t('intro') };
}

/** Homeward's welfare guidelines (#45), linked from the footer and the editors. */
export default async function GuidelinesPage() {
  const t = await getTranslations('Guidelines');
  const welfare = await getTranslations('Welfare');
  const taxonomy = await getTranslations('Taxonomy');
  const { language } = await getPreferences();
  const countries = sortedCountries(language);
  const countryName = (code: string) => countries.find((c) => c.code === code)?.name ?? code;
  const breedName = (key: string) =>
    taxonomy.has(`breed.dog.${key}` as never) ? taxonomy(`breed.dog.${key}` as never) : key;
  const and = new Intl.ListFormat(language, { type: 'conjunction' });
  const section = (key: 'age' | 'selling' | 'honest') => (
    <section aria-labelledby={key} className="mb-8">
      <h2 id={key} className="mb-2 text-xl font-bold">
        {t(`${key}.heading`)}
      </h2>
      <p className="max-w-prose">{t(`${key}.body`, { weeks: minAgeWeeks() })}</p>
    </section>
  );

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-4 max-w-prose">{t('intro')}</p>
      <p className="mb-8 max-w-prose rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown">
        {t('draft')}
      </p>
      {section('age')}
      {section('selling')}
      {section('honest')}

      <section aria-labelledby="breeds" className="mb-8">
        <h2 id="breeds" className="mb-2 text-xl font-bold">
          {t('breeds.heading')}
        </h2>
        <p className="mb-4 max-w-prose">{t('breeds.body')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line-strong">
                <th scope="col" className="py-2 pr-4">
                  {t('breeds.country')}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t('breeds.rule')}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t('breeds.breeds')}
                </th>
                <th scope="col" className="py-2">
                  {t('breeds.law')}
                </th>
              </tr>
            </thead>
            <tbody>
              {BREED_RULES.map((rule) => (
                <tr
                  key={`${rule.country}-${rule.level}`}
                  className="border-b border-line align-top"
                >
                  <th scope="row" className="py-2 pr-4 font-semibold">
                    {countryName(rule.country)}
                  </th>
                  <td className="py-2 pr-4">{t(`breeds.levels.${rule.level}`)}</td>
                  <td className="py-2 pr-4">{and.format(rule.breeds.map(breedName))}</td>
                  <td className="py-2">
                    {rule.law}{' '}
                    <a href={rule.source} rel="noreferrer">
                      {welfare('source')}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-prose text-sm text-muted">{welfare('notReviewed')}</p>
      </section>
    </div>
  );
}
