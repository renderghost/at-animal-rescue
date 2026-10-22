import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SignIn');
  return { title: t('title') };
}

export default async function SignInPage() {
  const t = await getTranslations('SignIn');
  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('comingSoon')}</p>
    </>
  );
}
