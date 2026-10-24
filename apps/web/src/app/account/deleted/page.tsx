import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AccountData');
  return { title: t('deletedTitle'), robots: { index: false } };
}

/** After deleting (#46); they're signed out by now, so this needs no account. */
export default async function AccountDeletedPage({
  searchParams,
}: {
  searchParams: Promise<{ public?: string }>;
}) {
  const t = await getTranslations('AccountData');
  const { public: alsoPublic } = await searchParams;
  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('deletedTitle')}</h1>
      <p role="status" className="mb-4">
        {t('deletedBody')}
      </p>
      <p className="mb-4">{alsoPublic ? t('deletedPublic') : t('deletedNotPublic')}</p>
      <p className="mb-6">{t('deletedAccount')}</p>
      <Link href="/">{t('home')}</Link>
    </div>
  );
}
