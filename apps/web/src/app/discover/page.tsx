import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Discover');
  return { title: t('title') };
}

export default async function DiscoverPage() {
  const t = await getTranslations('Discover');
  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p>{t('comingSoon')}</p>
    </>
  );
}
