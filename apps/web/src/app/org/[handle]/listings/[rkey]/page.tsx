import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AnimalDetails } from '@/components/AnimalDetails';
import { ButtonLink } from '@/components/Button';
import { CriteriaList } from '@/components/CriteriaList';
import { ExternalLink } from '@/components/ExternalLink';
import { OrgFacts } from '@/components/OrgFacts';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { formatMoney } from '@/lib/format';
import { imageUrl } from '@/lib/images';
import { photoCid } from '@/server/animals/animals';
import { loadListingPage } from '@/server/listing-page/listing';
import { listingTitle } from '@/server/listings/listing-form';
import { contactLinks } from '@/server/org-page/contact';
import { emailFact } from '@/server/org-page/email-fact';
import { emailConfirmationOf, orgFacts } from '@/server/org-page/org';
import { resolveOrg } from '@/server/org-page/resolve';
import { siteOrigin } from '@/server/site';

type Props = { params: Promise<{ handle: string; rkey: string }> };

async function load(params: Props['params']) {
  const { handle, rkey } = await params;
  const org = await resolveOrg(handle, `/listings/${rkey}`);
  const view = await loadListingPage(org, rkey);
  if (!view) notFound();
  const { formatLocale: locale } = await getPreferences();
  const names = view.animals.map(({ rkey: key, record }) => ({ rkey: key, name: record.name }));
  return { org, view, locale, title: listingTitle(org.did, view.listing, names, locale) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, view, title } = await load(params);
  const description = (view.listing.summary ?? view.animals[0]?.record.story)?.slice(0, 200);
  const cover = view.animals.flatMap(({ record }) => record.photos ?? [])[0];
  return {
    title: `${title} · ${org.profile.displayName}`,
    description,
    // Shared links show the cover photo, but never one that isn't public.
    openGraph: {
      title,
      description,
      siteName: 'Homeward',
      type: 'website',
      ...(cover &&
        view.hiddenBecause.length === 0 && {
          images: [{ url: imageUrl(org.did, photoCid(cover), 1600), alt: cover.alt }],
        }),
    },
    ...(view.hiddenBecause.length > 0 && { robots: { index: false } }),
  };
}

/** A listing's public page (#35). */
export default async function ListingPage({ params }: Props) {
  const { org, view, locale, title } = await load(params);
  const t = await getTranslations('ListingPage');
  const orgPage = await getTranslations('OrgPage');
  const { language } = await getPreferences();
  const { listing, animals } = view;
  const name = org.profile.displayName;
  const home = `/org/${encodeURIComponent(org.handle ?? org.did)}`;
  const url = `${await siteOrigin()}${home}/listings/${view.rkey}`;
  const [facts, confirmation] = await Promise.all([
    orgFacts(org.did),
    emailConfirmationOf(org.did),
  ]);
  const email = emailFact({
    confirmation,
    currentEmail: org.profile.contact.email,
    ownDomain: facts?.domain?.handle === org.handle ? facts?.domain?.handle : undefined,
    website: org.profile.contact.website,
  });
  const { preferred, others } = contactLinks(
    org,
    {
      email: t('enquireEmail', { name }),
      bluesky: t('enquireBluesky', { name }),
      website: t('enquireWebsite', { name }),
    },
    { subject: t('enquireSubject', { title }), body: t('enquireBody', { title, url }) },
  );
  const place = listing.location ?? org.profile.location;
  const countryName =
    sortedCountries(language).find(({ code }) => code === place.country)?.name ?? place.country;
  const fee = listing.adoptionFee;
  const amount = fee?.amount && formatMoney(fee.amount.amount, fee.amount.currency, locale);
  const adopted = listing.status === 'adopted';
  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));

  return (
    <article>
      <p className="mb-4">
        <Link href={home}>{t('backTo', { name })}</Link>
      </p>

      {view.owner && (
        <div
          role="status"
          className={
            view.hiddenBecause.length > 0
              ? 'mb-6 rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown'
              : 'mb-6 rounded-md border border-line bg-sunken p-4'
          }
        >
          {view.hiddenBecause.length > 0 ? (
            <>
              <p className="font-semibold">{t('ownerBanner')}</p>
              <ul className="mb-2 list-disc pl-6">
                {view.hiddenBecause.map((reason) => (
                  <li key={reason}>{t(`hidden.${reason}`)}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mb-2">{t('ownerPublic')}</p>
          )}
          <Link href={`/organisation/listings/${view.rkey}`}>{t('edit')}</Link>
        </div>
      )}

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{title}</h1>
        <p className="mb-3 text-muted">{t('organisation', { name })}</p>
        <div className="flex flex-wrap gap-2">
          {listing.status === 'reserved' && (
            <span className="rounded-full border border-line-strong px-3 py-1 text-sm font-semibold">
              {t('reserved')}
            </span>
          )}
          {adopted && (
            <span className="rounded-full border border-match-line bg-match-soft px-3 py-1 text-sm font-semibold text-match">
              {listing.adoptedAt
                ? t('adoptedOn', { date: dateOf(listing.adoptedAt) })
                : t('adopted')}
            </span>
          )}
          {animals.length > 1 && listing.bonded !== undefined && (
            <span className="rounded-full border border-line-strong px-3 py-1 text-sm font-semibold">
              {listing.bonded ? t('bonded') : t('separately')}
            </span>
          )}
        </div>
        {listing.status === 'reserved' && <p className="mt-2 text-sm">{t('reservedHint')}</p>}
        {listing.summary && <p className="mt-4 max-w-prose text-lg">{listing.summary}</p>}
      </header>

      {/* Reading order: getting in touch first, then the animals; on wide screens both side
          panels share the right-hand column, as on the organisation page. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]">
        <aside className="grid content-start gap-6 lg:col-start-2 lg:row-start-1">
          <section
            aria-labelledby="interested"
            className="rounded-lg border border-line bg-surface p-5"
          >
            <h2 id="interested" className="mb-3 text-lg font-bold">
              {t('interested')}
            </h2>
            {adopted ? (
              <p>
                {t('adoptedThanks', { title, name })}{' '}
                <Link href={home}>{t('seeOrganisation', { name })}</Link>
              </p>
            ) : (
              <>
                <ButtonLink href={preferred.href} className="w-full">
                  {preferred.label}
                </ButtonLink>
                {others.length > 0 && (
                  <p className="mt-3 text-sm">
                    {t('enquireOther')}{' '}
                    {others.map((link, i) => (
                      <span key={link.key}>
                        {i > 0 && ' · '}
                        <a href={link.href}>{link.label}</a>
                      </span>
                    ))}
                  </p>
                )}
              </>
            )}
            <dl className="mt-5 grid gap-1">
              {fee && !adopted && (
                <>
                  <dt className="font-semibold">{t('fee')}</dt>
                  <dd className="mb-2">
                    {fee.kind === 'none'
                      ? t('feeNone')
                      : fee.kind === 'donation'
                        ? amount
                          ? t('feeDonationAmount', { amount })
                          : t('feeDonation')
                        : t('feeAmount', { amount: amount ?? '' })}
                  </dd>
                </>
              )}
              <dt className="font-semibold">{t('where')}</dt>
              <dd>{[place.locality, place.region, countryName].filter(Boolean).join(', ')}</dd>
            </dl>
          </section>
        </aside>
        <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {animals.map(({ rkey, record }) => (
            <AnimalDetails
              key={rkey}
              did={org.did}
              animalKey={rkey}
              animal={record}
              owner={view.owner}
            />
          ))}
          <section aria-labelledby="criteria" className="mb-12">
            <h2 id="criteria" className="mb-2 text-2xl font-bold">
              {t('criteria')}
            </h2>
            {listing.criteria && listing.criteria.length > 0 ? (
              <>
                <p className="mb-4 text-muted">{t('criteriaHint', { name })}</p>
                <CriteriaList criteria={listing.criteria} />
              </>
            ) : (
              <p>{t('noCriteria', { name })}</p>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-6 lg:col-start-2 lg:row-start-2">
          {org.profile.donationLinks && org.profile.donationLinks.length > 0 && (
            <section
              aria-labelledby="donate"
              className="rounded-lg border border-line bg-surface p-5"
            >
              <h2 id="donate" className="mb-3 text-lg font-bold">
                {orgPage('donate', { name })}
              </h2>
              <ul className="grid gap-2">
                {org.profile.donationLinks.map((link) => (
                  <li key={link.url}>
                    <ExternalLink href={link.url}>
                      {link.label ?? orgPage('donateDefault')}
                    </ExternalLink>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <OrgFacts
            handle={org.handle}
            facts={facts}
            email={email}
            charity={org.profile.charityRegistration}
            locale={locale}
          />
          <p>
            <Link href={home}>{t('seeOrganisation', { name })}</Link>
          </p>
        </aside>
      </div>
    </article>
  );
}
