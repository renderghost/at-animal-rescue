import type { Metadata } from 'next';
import { CONFIRMATION_LIFETIME_MS, confirmationHolds, EmailConfirmationStore } from '@homeward/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmailConfirmationPanel } from '@/components/EmailConfirmationPanel';
import { OrganisationProfileForm } from '@/components/OrganisationProfileForm';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { formatLocale } from '@/lib/format';
import { getCurrentUser } from '@/server/auth/session';
import { getDb, getKeyring } from '@/server/db';
import { getRepoClient, loadOrganisationProfile } from '@/server/onboarding/current-role';
import { profileToFormValues } from '@/server/onboarding/organisation-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('OrganisationProfile');
  return { title: t('title') };
}

export default async function OrganisationProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const client = await getRepoClient();
  if (!client) redirect('/sign-in');
  // The profile is read from the organisation's own repository, so edits made elsewhere show.
  const lookup = await loadOrganisationProfile(client);
  if (lookup.kind === 'missing') redirect('/welcome');
  const t = await getTranslations('OrganisationProfile');
  const { language, country } = await getPreferences();
  const email = lookup.kind === 'found' ? lookup.record.contact.email : undefined;
  const confirmations = new EmailConfirmationStore(getDb(), getKeyring());
  const [confirmation, codeWaiting] = await Promise.all([
    confirmations.get(user.did),
    email ? confirmations.pending(user.did, email) : false,
  ]);
  const locale = formatLocale(language, country);
  const day = (date: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);
  const confirmedDates = confirmationHolds(confirmation, email)
    ? {
        on: day(confirmation.confirmedAt),
        until: day(new Date(confirmation.confirmedAt.getTime() + CONFIRMATION_LIFETIME_MS)),
      }
    : undefined;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-2">{t('intro')}</p>
      <p className="mb-8">
        <Link href={`/org/${encodeURIComponent(user.did)}`}>{t('viewPublic')}</Link>
        {' · '}
        <Link href="/organisation/animals">{t('yourAnimals')}</Link>
      </p>
      {lookup.kind === 'found' ? (
        <OrganisationProfileForm
          initialValues={profileToFormValues(lookup.record)}
          unlocated={!lookup.record.location.latitude}
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
      {lookup.kind === 'found' && (
        <EmailConfirmationPanel
          hasEmail={Boolean(email)}
          confirmed={confirmedDates}
          codeWaiting={codeWaiting}
          locale={locale}
        />
      )}
    </div>
  );
}
