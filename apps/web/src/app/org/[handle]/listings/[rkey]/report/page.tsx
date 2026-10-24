import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ReportForm } from '@/components/ReportForm';
import { getPreferences } from '@/i18n/preferences';
import { publicListing } from '@/server/listing-page/public-listing';

type Props = { params: Promise<{ handle: string; rkey: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Report');
  return { title: t('metaTitle'), robots: { index: false } };
}

/** Reporting a listing anyone can see (#44, DSA Art. 16): no account needed. */
export default async function ReportPage({ params }: Props) {
  const { handle, rkey } = await params;
  const { formatLocale: locale } = await getPreferences();
  const target = await publicListing(decodeURIComponent(handle), rkey, locale);
  if (!target) notFound();
  const t = await getTranslations('Report');
  const { org, title, path } = target;

  return (
    <div className="max-w-2xl">
      <p className="mb-4">
        <Link href={path}>{t('back', { title })}</Link>
      </p>
      <h1 className="mb-4 text-3xl font-bold">{t('title', { title })}</h1>
      <p className="mb-6">
        {t.rich('intro', {
          name: org.profile.displayName,
          link: (chunks) => <Link href="/guidelines">{chunks}</Link>,
        })}
      </p>
      <ReportForm org={org.handle ?? org.did} rkey={target.view.rkey} path={path} />
    </div>
  );
}
