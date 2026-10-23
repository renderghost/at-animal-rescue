import { getTranslations } from 'next-intl/server';
import { OrganisationLink } from './organisation-link';

/** A listing that doesn't exist or isn't public (#35): say so, and point to its organisation. */
export default async function ListingNotFound() {
  const t = await getTranslations('ListingPage');
  return (
    <div className="max-w-prose">
      <h1 className="mb-4 text-3xl font-bold">{t('notAvailable')}</h1>
      <p className="mb-4">{t('notAvailableBody')}</p>
      <OrganisationLink label={t('notAvailableLink')} />
    </div>
  );
}
