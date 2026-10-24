import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/Button';
import { ExternalLink } from '@/components/ExternalLink';
import { ListingCard } from '@/components/ListingCard';
import { OrgFacts } from '@/components/OrgFacts';
import { OrgFiltersForm } from '@/components/OrgFiltersForm';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { formatLocale } from '@/lib/format';
import { isAdmin } from '@/server/admin/admins';
import { getCurrentUser } from '@/server/auth/session';
import { filtersToQuery, hasFilters, parseOrgFilters } from '@/server/org-page/filters';
import { contactLinks } from '@/server/org-page/contact';
import { emailFact } from '@/server/org-page/email-fact';
import { emailConfirmationOf, orgFacts, orgListings } from '@/server/org-page/org';
import { resolveOrg } from '@/server/org-page/resolve';

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const org = await resolveOrg((await params).handle);
  return { title: org.profile.displayName, description: org.profile.description?.slice(0, 160) };
}

const HAPPY_ENDINGS_SHOWN = 12;

export default async function OrgPage({ params, searchParams }: Props) {
  const org = await resolveOrg((await params).handle);
  const filters = parseOrgFilters(await searchParams);
  const viewer = await getCurrentUser();
  const ownerView = viewer?.did === org.did;
  // Moderators see what isn't public yet too, labelled as the organisation sees it (#43).
  const staffView = ownerView || isAdmin(viewer?.did);
  const t = await getTranslations('OrgPage');
  const { language, country } = await getPreferences();
  const locale = formatLocale(language, country);
  const { profile } = org;
  const name = profile.displayName;

  const [animals, happyEndings, facts, confirmation] = await Promise.all([
    orgListings(org, viewer?.did, { ...filters, statuses: ['available', 'reserved'], limit: 24 }),
    orgListings(org, viewer?.did, { statuses: ['adopted'], limit: HAPPY_ENDINGS_SHOWN }),
    orgFacts(org.did),
    emailConfirmationOf(org.did),
  ]);
  const email = emailFact({
    confirmation,
    currentEmail: profile.contact.email,
    // Only a handle that has been checked as the organisation's own domain counts.
    ownDomain: facts?.domain?.handle === org.handle ? facts?.domain?.handle : undefined,
    website: profile.contact.website,
  });
  const countryName =
    sortedCountries(language).find(({ code }) => code === profile.location.country)?.name ??
    profile.location.country;
  const place = [profile.location.locality, profile.location.region, countryName]
    .filter(Boolean)
    .join(', ');
  const { preferred, others } = contactLinks(
    org,
    {
      email: t('contactEmail', { name }),
      bluesky: t('contactBluesky'),
      website: t('contactWebsite'),
    },
    { subject: t('contactSubject') },
  );
  const home = `/org/${encodeURIComponent(org.handle ?? org.did)}`;

  return (
    <div>
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{name}</h1>
        <p className="text-muted">
          {place}
          {org.handle && <> · @{org.handle}</>}
        </p>
        {ownerView && (
          <p className="mt-2">
            <Link href="/organisation/profile">{t('editProfile')}</Link>
          </p>
        )}
      </header>

      {!org.approved && (
        <p
          role="status"
          className="mb-8 rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown"
        >
          {ownerView ? t('notApprovedOwner') : t('notApproved')}
        </p>
      )}

      {/* Reading order: contact, the content, then donations and facts. On wide screens the
          three panels share the right-hand column. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]">
        <aside className="grid content-start gap-6 lg:col-start-2 lg:row-start-1">
          <section
            aria-labelledby="contact"
            className="rounded-lg border border-line bg-surface p-5"
          >
            <h2 id="contact" className="mb-3 text-lg font-bold">
              {t('contact')}
            </h2>
            <ButtonLink href={preferred.href} className="w-full">
              {preferred.label}
            </ButtonLink>
            {others.length > 0 && (
              <p className="mt-3 text-sm">
                {t('contactOther')}{' '}
                {others.map((link, i) => (
                  <span key={link.key}>
                    {i > 0 && ' · '}
                    <a href={link.href}>{link.label}</a>
                  </span>
                ))}
              </p>
            )}
          </section>
        </aside>
        <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {profile.description && (
            <section aria-labelledby="about" className="mb-10">
              <h2 id="about" className="mb-3 text-xl font-bold">
                {t('about')}
              </h2>
              <p className="max-w-prose whitespace-pre-line">{profile.description}</p>
            </section>
          )}

          <section aria-labelledby="animals" className="mb-12">
            <h2 id="animals" className="mb-4 text-2xl font-bold">
              {t('animals')}
            </h2>
            {ownerView && <p className="mb-4 text-sm text-muted">{t('ownerLabels')}</p>}
            <OrgFiltersForm filters={filters} active={hasFilters(filters)} />
            {animals.listings.length === 0 ? (
              <p className="mb-4">
                {hasFilters(filters) ? (
                  <>
                    {t('noMatches')} <Link href={home}>{t('clearFilters')}</Link>
                  </>
                ) : (
                  t('noAnimals')
                )}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {animals.listings.map((listing) => (
                  <ListingCard
                    key={listing.uri}
                    listing={listing}
                    locale={locale}
                    ownerView={staffView}
                  />
                ))}
              </div>
            )}
            {animals.cursor && (
              <p className="mt-6">
                <Link href={filtersToQuery(filters, animals.cursor)}>{t('more')}</Link>
              </p>
            )}
          </section>

          {happyEndings.listings.length > 0 && (
            <section aria-labelledby="happy-endings" className="mb-12">
              <h2 id="happy-endings" className="mb-2 text-2xl font-bold">
                {t('happyEndings')}
              </h2>
              <p className="mb-4 text-muted">{t('happyEndingsIntro', { name })}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {happyEndings.listings.map((listing) => (
                  <ListingCard
                    key={listing.uri}
                    listing={listing}
                    locale={locale}
                    ownerView={staffView}
                  />
                ))}
              </div>
              {happyEndings.cursor && (
                <p className="mt-6">
                  <Link href={`${home}/happy-endings`}>{t('showAllHappyEndings')}</Link>
                </p>
              )}
            </section>
          )}

          {profile.adoptionProcess && (
            <section aria-labelledby="process" className="mb-10">
              <h2 id="process" className="mb-3 text-xl font-bold">
                {t('adoptionProcess')}
              </h2>
              <p className="max-w-prose whitespace-pre-line">{profile.adoptionProcess}</p>
            </section>
          )}
        </div>
        <aside className="grid content-start gap-6 lg:col-start-2 lg:row-start-2">
          {profile.donationLinks && profile.donationLinks.length > 0 && (
            <section
              aria-labelledby="donate"
              className="rounded-lg border border-line bg-surface p-5"
            >
              <h2 id="donate" className="mb-3 text-lg font-bold">
                {t('donate', { name })}
              </h2>
              <ul className="grid gap-2">
                {profile.donationLinks.map((link) => (
                  <li key={link.url}>
                    <ExternalLink href={link.url}>{link.label ?? t('donateDefault')}</ExternalLink>
                    {['oneOff', 'recurring', 'both'].includes(link.kind) && (
                      <span className="text-sm text-muted">
                        {' '}
                        · {t(`donateKind.${link.kind as 'oneOff' | 'recurring' | 'both'}`)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <OrgFacts
            handle={org.handle}
            facts={facts}
            email={email}
            charity={profile.charityRegistration}
            locale={locale}
          />
        </aside>
      </div>
    </div>
  );
}
