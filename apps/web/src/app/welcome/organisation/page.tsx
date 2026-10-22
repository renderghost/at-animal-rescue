import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { OrganisationForm } from '@/components/OrganisationForm';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Welcome.org');
  return { title: t('title') };
}

export default async function OrganisationOnboardingPage() {
  if (!(await getCurrentUser())) redirect('/sign-in');
  // Already onboarded: nothing to choose.
  if (await getCurrentRole()) redirect('/');
  const t = await getTranslations('Welcome.org');
  const { language, country } = await getPreferences();

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-8">{t('intro')}</p>
      <OrganisationForm countries={sortedCountries(language)} defaultCountry={country ?? ''} />
    </div>
  );
}
