import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/Button';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Welcome.done');
  return { title: t('title') };
}

export default async function OnboardingDonePage() {
  if (!(await getCurrentUser())) redirect('/sign-in');
  const role = await getCurrentRole();
  if (!role) redirect('/welcome');
  const t = await getTranslations('Welcome.done');

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-2">{role === 'organisation' ? t('orgBody') : t('adopterBody')}</p>
      <p className="mb-8 text-muted">{t('comingSoon')}</p>
      <ButtonLink href="/discover">{t('browse')}</ButtonLink>
    </div>
  );
}
