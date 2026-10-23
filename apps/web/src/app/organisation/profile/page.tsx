import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { OrganisationProfileForm } from '@/components/OrganisationProfileForm';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { getCurrentUser } from '@/server/auth/session';
import { getRepoClient, loadOrganisationProfile } from '@/server/onboarding/current-role';
import { profileToFormValues } from '@/server/onboarding/organisation-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('OrganisationProfile');
  return { title: t('title') };
}

export default async function OrganisationProfilePage() {
  if (!(await getCurrentUser())) redirect('/sign-in');
  const client = await getRepoClient();
  if (!client) redirect('/sign-in');
  // The profile is read from the organisation's own repository, so edits made elsewhere show.
  const lookup = await loadOrganisationProfile(client);
  if (lookup.kind === 'missing') redirect('/welcome');
  const t = await getTranslations('OrganisationProfile');
  const { language } = await getPreferences();

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-8">{t('intro')}</p>
      {lookup.kind === 'found' ? (
        <OrganisationProfileForm
          initialValues={profileToFormValues(lookup.profile)}
          unlocated={!lookup.profile.location.latitude}
          countries={sortedCountries(language)}
        />
      ) : (
        <p
          role="alert"
          className="rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
        >
          {t('loadFailed')}
        </p>
      )}
    </div>
  );
}
