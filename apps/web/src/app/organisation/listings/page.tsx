import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/Badge';
import { ButtonLink } from '@/components/Button';
import { getPreferences } from '@/i18n/preferences';
import { requireOrganisation } from '@/server/animals/current-org';
import { listListings } from '@/server/listings/listings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Listings');
  return { title: t('title') };
}

/** The organisation's listings, to open in the editor. The full dashboard is #34. */
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { did, client } = await requireOrganisation();
  const { listings, pdsUnavailable } = await listListings(did, client);
  const t = await getTranslations('Listings');
  const { formatLocale: locale } = await getPreferences();
  const { deleted } = await searchParams;
  const and = new Intl.ListFormat(locale, { type: 'conjunction' });
  const status = (value: string) =>
    t.has(`status.${value}` as never) ? t(`status.${value}` as never) : value;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-2 max-w-prose">{t('intro')}</p>
      <p className="mb-6">
        <Link href="/organisation/animals">{t('yourAnimals')}</Link>
      </p>
      {deleted && (
        <p role="status" className="mb-6 rounded-md border border-line bg-sunken p-4">
          {t('deleted')}
        </p>
      )}
      {pdsUnavailable && (
        <p className="mb-6 rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown">
          {t('pdsUnavailable')}
        </p>
      )}
      <ButtonLink href="/organisation/listings/new" className="mb-8">
        {t('add')}
      </ButtonLink>
      {listings.length === 0 ? (
        <p>{t('none')}</p>
      ) : (
        <ul className="grid gap-3">
          {listings.map((listing) => {
            const title = listing.title ?? and.format(listing.animals);
            return (
              <li
                key={listing.rkey}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4"
              >
                <div>
                  <Link
                    href={`/organisation/listings/${listing.rkey}`}
                    className="text-lg font-bold"
                    aria-label={t('edit', { title })}
                  >
                    {title}
                  </Link>
                  {listing.title && <p className="text-muted">{and.format(listing.animals)}</p>}
                </div>
                <Badge tone={listing.status === 'available' ? 'match' : 'neutral'}>
                  {status(listing.status)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
