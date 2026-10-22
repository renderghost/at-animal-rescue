import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SignInForm } from '@/components/SignInForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SignIn');
  return { title: t('title') };
}

export default async function SignInPage() {
  const t = await getTranslations('SignIn');
  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-8 max-w-prose">{t('intro')}</p>
      <SignInForm />
    </>
  );
}
