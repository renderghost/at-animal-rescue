import { pet } from '@homeward/lexicons';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { clearAdopterProfile } from '@/app/actions/adopter-profile';
import { AdopterProfileForm } from '@/components/AdopterProfileForm';
import { Button } from '@/components/Button';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { toFormValues } from '@/server/adopter/adopter-form';
import { publicAreaOf } from '@/server/adopter/save-adopter';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole, getRepoClient, lookupRecord } from '@/server/onboarding/current-role';
import { getPrivateStore } from '@/server/private-store';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AdopterProfile');
  return { title: t('title') };
}

export default async function AdopterProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ cleared?: string }>;
}) {
  const user = await getCurrentUser();
  const client = await getRepoClient();
  if (!user || !client) redirect('/sign-in');
  if ((await getCurrentRole()) !== 'adopter') redirect('/account');

  const store = getPrivateStore();
  const [household, location, profile] = await Promise.all([
    store.get(user.did, 'pet.homeward.adopter.household', 'self'),
    store.get(user.did, 'pet.homeward.adopter.location', 'self'),
    lookupRecord(() => client.get(pet.homeward.adopter.profile)),
  ]);
  const t = await getTranslations('AdopterProfile');
  const { language } = await getPreferences();
  const countries = sortedCountries(language);
  const { cleared } = await searchParams;

  const initialValues = toFormValues({
    household,
    location,
    profile: profile.kind === 'found' ? profile.record : undefined,
  });

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-6">{t('intro')}</p>

      <section
        aria-labelledby="privacy"
        className="mb-8 rounded-md border border-line bg-surface p-5"
      >
        <h2 id="privacy" className="mb-3 text-lg font-bold">
          {t('privacyHeading')}
        </h2>
        <ul className="grid list-disc gap-2 pl-5">
          <li>{t('privacyPrivate')}</li>
          <li>{t('privacyOptional')}</li>
          <li>{t('privacyControl')}</li>
          <li>{t('privacyPublic')}</li>
        </ul>
      </section>

      {cleared && (
        <p role="status" className="mb-6 rounded-md border border-line bg-sunken p-4">
          {t('deleted')}
        </p>
      )}
      {profile.kind === 'unavailable' && (
        <p className="mb-6 rounded-md border border-unknown-line bg-unknown-soft p-4 text-unknown">
          {t('publicLoadFailed')}
        </p>
      )}

      <AdopterProfileForm
        // A fresh form after each deletion, so it doesn't show answers from before. The key
        // must otherwise stay the same, or a save without JavaScript loses its result.
        key={cleared ?? 'form'}
        initialValues={initialValues}
        publicProfileKnown={profile.kind !== 'unavailable'}
        publicArea={publicAreaOf(location)}
        countries={countries}
      />

      {/* Two deliberate steps, without JavaScript: open the panel, then confirm. */}
      <details className="mt-12 border-t border-line pt-6">
        <summary className="cursor-pointer text-xl font-bold">{t('deleteHeading')}</summary>
        <p className="mt-4 mb-4 text-muted">{t('deleteBody')}</p>
        <form action={clearAdopterProfile}>
          <Button type="submit" variant="secondary">
            {t('deleteAction')}
          </Button>
        </form>
      </details>
    </div>
  );
}
