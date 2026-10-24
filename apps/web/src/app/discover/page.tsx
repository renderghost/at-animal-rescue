import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DiscoverFiltersForm } from '@/components/DiscoverFiltersForm';
import { ListingCard } from '@/components/ListingCard';
import { SaveSearch, type SaveStatus } from '@/components/SaveSearch';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { discoverQuery, parseDiscoverFilters } from '@/lib/discover-filters';
import { formatDistance } from '@/lib/format';
import { listSavedSearches, suggestedName } from '@/server/adopter/saved-searches';
import { getCurrentUser } from '@/server/auth/session';
import { discover } from '@/server/discover/search';

const SAVE_STATUSES: readonly SaveStatus[] = ['saved', 'full', 'nameRequired', 'nameTooLong'];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Discover');
  return { title: t('title'), description: t('intro') };
}

/** Network-wide discovery (#39). */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseDiscoverFilters(params);
  const { language, country, distanceUnit, formatLocale: locale } = await getPreferences();
  const t = await getTranslations('Discover');
  const result = await discover(filters, { unit: distanceUnit, country, language });

  // Adopters can save the search (#41); the result of saving comes back in the URL.
  const user = result.viewer === 'adopter' ? await getCurrentUser() : undefined;
  const saved = user && (await listSavedSearches(user.did, distanceUnit));
  const status = (params.saved ? 'saved' : params.saveError) as SaveStatus | undefined;

  return (
    <>
      <h1 className="mb-2 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-6 max-w-prose">{t('intro')}</p>

      {result.viewer === 'newcomer' && (
        <p className="mb-6 rounded-md border border-line bg-surface p-4">
          {t('profilePrompt')} <Link href="/welcome">{t('profileLink')}</Link>
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside>
          <DiscoverFiltersForm
            filters={filters}
            sort={result.sort}
            canMatch={result.canMatch}
            hasProfileLocation={result.hasProfileLocation}
            countries={sortedCountries(language)}
            defaultCountry={country}
            unit={distanceUnit}
            placeChoices={result.placeChoices}
          />
          {saved && (
            <SaveSearch
              query={discoverQuery(filters)}
              suggestedName={await suggestedName(filters, { unit: distanceUnit, locale })}
              count={saved.length}
              status={status && SAVE_STATUSES.includes(status) ? status : undefined}
            />
          )}
        </aside>
        <section aria-labelledby="results" className="min-w-0">
          <h2 id="results" className="sr-only">
            {t('title')}
          </h2>
          {result.origin && (
            <p className="mb-4 text-sm text-muted">
              {result.origin.from === 'profile'
                ? t('fromProfile', { place: result.origin.label })
                : t('fromTyped', { place: result.origin.label })}
            </p>
          )}
          {result.unlocated && (
            <p className="mb-4 rounded-md border border-dashed border-unknown-line bg-unknown-soft p-3 text-unknown">
              {result.unlocated === 'notFound'
                ? t('notFound', { place: filters.near ?? '' })
                : t('geocoderDown', { place: filters.near ?? '' })}
            </p>
          )}
          {result.listings.length === 0 ? (
            <p>{t('none')}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {result.listings.map((listing) => (
                <ListingCard
                  key={listing.uri}
                  listing={listing}
                  locale={locale}
                  showOrganisation
                  distance={
                    listing.distanceKm === undefined
                      ? undefined
                      : listing.distanceKm < 1
                        ? t('nearby')
                        : t('away', {
                            distance: formatDistance(listing.distanceKm, distanceUnit, locale),
                          })
                  }
                  match={listing.match}
                />
              ))}
            </div>
          )}
          {result.next && (
            <p className="mt-6">
              <Link href={`/discover${discoverQuery(filters, result.next)}`}>{t('more')}</Link>
            </p>
          )}
        </section>
      </div>
    </>
  );
}
