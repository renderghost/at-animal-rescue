import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SignInForm } from '@/components/SignInForm';
import { getCurrentUser } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SignIn');
  return { title: t('title') };
}

export default async function SignInPage() {
  if (await getCurrentUser()) redirect('/');
  const t = await getTranslations('SignIn');
  return (
    <>
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-8 max-w-prose">{t('intro')}</p>
      <SignInForm />
      <p className="mt-8">
        {t('newHere')} <Link href="/get-started">{t('getStarted')}</Link>
      </p>
    </>
  );
}
