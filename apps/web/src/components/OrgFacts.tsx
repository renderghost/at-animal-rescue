import type { OrgFacts as CheckedFacts } from '@homeward/db';
import { getTranslations } from 'next-intl/server';
import type { OrganisationProfile } from '@/server/onboarding/organisation-form';
import type { EmailFact } from '@/server/org-page/email-fact';
import { ExternalLink } from './ExternalLink';

/**
 * Facts, never a "verified" badge (spec §2): what was checked, how and when, and what the
 * organisation only declared, with a way to check it yourself.
 */
export async function OrgFacts({
  handle,
  facts,
  email,
  charity,
  locale,
}: {
  /** The organisation's current verified handle. */
  handle?: string;
  facts?: CheckedFacts;
  /** The confirmed contact email, when its confirmation still counts. */
  email?: EmailFact;
  charity?: OrganisationProfile['charityRegistration'];
  locale: string;
}) {
  const t = await getTranslations('OrgPage');
  const date = (value: Date | string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(value));
  // A fact about an earlier handle no longer applies; the next check replaces it.
  const domain = facts?.domain?.handle === handle ? facts?.domain : undefined;
  const verifications = facts?.verifications ?? [];
  const items = [];

  if (domain && facts?.domainCheckedAt) {
    items.push(
      <li key="domain">
        {t('factDomain', { handle: domain.handle })}{' '}
        <span className="text-muted">
          {t(domain.method === 'dns' ? 'factDomainDns' : 'factDomainHttps', {
            date: date(facts.domainCheckedAt),
          })}
        </span>
      </li>,
    );
  }
  for (const verification of verifications) {
    const issuer = verification.issuerName
      ? `${verification.issuerName}${verification.issuerHandle ? ` (@${verification.issuerHandle})` : ''}`
      : verification.issuerHandle
        ? `@${verification.issuerHandle}`
        : verification.issuer;
    items.push(
      <li key={verification.issuer}>
        {t('factVerified', { issuer, date: date(verification.createdAt) })}{' '}
        <span className="text-muted">
          {facts?.verificationsCheckedAt &&
            t('factChecked', { date: date(facts.verificationsCheckedAt) })}{' '}
          <ExternalLink
            href={`https://bsky.app/profile/${verification.issuerHandle ?? verification.issuer}`}
          >
            {t('factVerifier')}
          </ExternalLink>
        </span>
      </li>,
    );
  }
  if (email) {
    const also =
      email.alsoHandle && email.alsoWebsite
        ? t('factEmailBoth')
        : email.alsoHandle
          ? t('factEmailHandle')
          : email.alsoWebsite
            ? t('factEmailWebsite')
            : undefined;
    items.push(
      <li key="email">
        {t('factEmail', { domain: email.domain, date: date(email.confirmedAt) })}
        {also && <> {also}</>}
      </li>,
    );
  }
  if (charity) {
    items.push(
      <li key="charity">
        {t('charity', { registry: charity.registry, number: charity.number })}
        {charity.registerUrl && (
          <>
            {' '}
            <ExternalLink href={charity.registerUrl}>{t('charityCheck')}</ExternalLink>
          </>
        )}
      </li>,
    );
  }

  return (
    <section aria-labelledby="facts" className="rounded-lg border border-line bg-surface p-5">
      <h2 id="facts" className="mb-2 text-lg font-bold">
        {t('facts')}
      </h2>
      <p className="mb-3 text-sm text-muted">{t('factsIntro')}</p>
      {items.length > 0 ? (
        <ul className="grid gap-3 text-sm">{items}</ul>
      ) : (
        <p className="text-sm">{t('noFacts')}</p>
      )}
    </section>
  );
}
