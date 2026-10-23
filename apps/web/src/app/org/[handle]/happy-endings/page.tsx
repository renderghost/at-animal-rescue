import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ListingCard } from '@/components/ListingCard';
import { getPreferences } from '@/i18n/preferences';
import { formatLocale } from '@/lib/format';
import { getCurrentUser } from '@/server/auth/session';
import { orgListings } from '@/server/org-page/org';
import { resolveOrg } from '@/server/org-page/resolve';

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const org = await resolveOrg((await params).handle, '/happy-endings');
  const t = await getTranslations('OrgPage');
  return { title: t('happyEndingsTitle', { name: org.profile.displayName }) };
}

export default async function HappyEndingsPage({ params, searchParams }: Props) {
  const org = await resolveOrg((await params).handle, '/happy-endings');
  const { cursor } = await searchParams;
  const viewer = await getCurrentUser();
  const t = await getTranslations('OrgPage');
  const { language, country } = await getPreferences();
  const locale = formatLocale(language, country);
  const name = org.profile.displayName;
  const page = await orgListings(org, viewer?.did, { statuses: ['adopted'], limit: 24, cursor });
  const home = `/org/${encodeURIComponent(org.handle ?? org.did)}`;

  return (
    <div>
      <p className="mb-4">
        <Link href={home}>{t('backToOrg', { name })}</Link>
      </p>
      <h1 className="mb-2 text-3xl font-bold">{t('happyEndingsTitle', { name })}</h1>
      <p className="mb-8 text-muted">{t('happyEndingsIntro', { name })}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {page.listings.map((listing) => (
          <ListingCard
            key={listing.uri}
            listing={listing}
            locale={locale}
            ownerView={viewer?.did === org.did}
          />
        ))}
      </div>
      {page.cursor && (
        <p className="mt-6">
          <Link href={`?cursor=${encodeURIComponent(page.cursor)}`}>{t('moreHappyEndings')}</Link>
        </p>
      )}
    </div>
  );
}
