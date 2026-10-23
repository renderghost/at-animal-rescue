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

export default async function OnboardingDonePage({
  searchParams,
}: {
  searchParams: Promise<{ unlocated?: string }>;
}) {
  if (!(await getCurrentUser())) redirect('/sign-in');
  const role = await getCurrentRole();
  if (!role) redirect('/welcome');
  const t = await getTranslations('Welcome.done');
  const { unlocated } = await searchParams;

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      {role === 'organisation' ? (
        <>
          <p className="mb-2">{t('orgBody')}</p>
          <p className="mb-8 text-muted">{t('comingSoon')}</p>
        </>
      ) : (
        <p className="mb-8">{t('adopterBody')}</p>
      )}
      {role === 'organisation' && (unlocated === 'notFound' || unlocated === 'unavailable') && (
        <p
          role="status"
          className="mb-8 rounded-md border border-unknown-line bg-unknown-soft p-4 text-unknown"
        >
          {t(unlocated === 'notFound' ? 'unlocatedNotFound' : 'unlocatedUnavailable')}
        </p>
      )}
      {role === 'organisation' ? (
        <>
          <p className="mb-4">{t('orgProfile')}</p>
          <div className="flex flex-wrap gap-4">
            <ButtonLink href="/organisation/profile">{t('orgProfileAction')}</ButtonLink>
            <ButtonLink href="/organisation/animals/new" variant="secondary">
              {t('orgAnimalsAction')}
            </ButtonLink>
            <ButtonLink href="/discover" variant="secondary">
              {t('browse')}
            </ButtonLink>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-4">
          <ButtonLink href="/adopter/profile">{t('adopterProfileAction')}</ButtonLink>
          <ButtonLink href="/discover" variant="secondary">
            {t('browse')}
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
