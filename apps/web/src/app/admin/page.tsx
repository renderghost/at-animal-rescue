import type { OrgUnderReview } from '@homeward/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { approveOrgAction, rejectOrgAction, revokeOrgAction } from '@/app/actions/admin';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { TextArea } from '@/components/Field';
import { OrgFacts } from '@/components/OrgFacts';
import { getPreferences } from '@/i18n/preferences';
import { MAX_REASON, orgReviews, requireAdmin } from '@/server/admin/admin';
import { emailFact } from '@/server/org-page/email-fact';
import { emailConfirmationOf, getPublicOrg, orgFacts } from '@/server/org-page/org';
import { listingReports } from '@/server/reports/reports';
import { ReportedListing, SecondLook } from './listing-moderation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Admin');
  return { title: t('title'), robots: { index: false } };
}

type Search = { done?: string; error?: string; action?: string; did?: string; target?: string };

const hidden = (chunks: ReactNode) => <span className="sr-only">{chunks}</span>;
const summary = 'cursor-pointer text-accent underline underline-offset-[0.15em]';

/**
 * The moderation console: reports about listings and second looks (#44), then organisations
 * waiting, not approved and approved (#43).
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const moderator = await requireAdmin();
  const t = await getTranslations('Admin');
  const search = await searchParams;
  const reports = listingReports();
  const [{ pending, notApproved, approved }, open, appeals] = await Promise.all([
    orgReviews().list(),
    reports.open(),
    reports.openAppeals(),
  ]);
  // Open reports by listing, oldest report first, so one decision covers them all.
  const byListing = new Map<string, typeof open>();
  for (const report of open) {
    byListing.set(report.listingUri, [...(byListing.get(report.listingUri) ?? []), report]);
  }
  const sections = [
    { key: 'pending', orgs: pending },
    { key: 'notApproved', orgs: notApproved },
    { key: 'approved', orgs: approved },
  ] as const;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-6 max-w-prose">{t('intro')}</p>
      {search.done && t.has(`done.${search.done}` as never) && (
        <p role="status" className="mb-6 rounded-md border border-line bg-sunken p-4">
          {t(`done.${search.done}` as never)}
        </p>
      )}
      <section aria-labelledby="section-reports" className="mb-10">
        <h2 id="section-reports" className="mb-3 text-xl font-bold">
          {t('reports')} ({byListing.size})
        </h2>
        {byListing.size === 0 ? (
          <p className="text-muted">{t('none')}</p>
        ) : (
          <ul className="grid gap-4">
            {[...byListing].map(([uri, items]) => (
              <li key={uri}>
                <ReportedListing uri={uri} reports={items} moderator={moderator} search={search} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="section-second-looks" className="mb-10">
        <h2 id="section-second-looks" className="mb-3 text-xl font-bold">
          {t('secondLooks')} ({appeals.length})
        </h2>
        {appeals.length === 0 ? (
          <p className="text-muted">{t('none')}</p>
        ) : (
          <ul className="grid gap-4">
            {appeals.map((hide) => (
              <li key={hide.listingUri}>
                <SecondLook hide={hide} moderator={moderator} search={search} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {sections.map(({ key, orgs }) => (
        <section key={key} aria-labelledby={`section-${key}`} className="mb-10">
          <h2 id={`section-${key}`} className="mb-3 text-xl font-bold">
            {t(key)} ({orgs.length})
          </h2>
          {orgs.length === 0 ? (
            <p className="text-muted">{t('none')}</p>
          ) : (
            <ul className="grid gap-4">
              {orgs.map((org) => (
                <li key={org.did}>
                  <OrgCard org={org} moderator={moderator} search={search} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

async function OrgCard({
  org,
  moderator,
  search,
}: {
  org: OrgUnderReview;
  moderator: string;
  search: Search;
}) {
  const t = await getTranslations('Admin');
  const { formatLocale: locale } = await getPreferences();
  const [profile, facts, confirmation, history] = await Promise.all([
    getPublicOrg({ did: org.did }),
    orgFacts(org.did),
    emailConfirmationOf(org.did),
    orgReviews().history(org.did),
  ]);
  const dateOf = (value: Date | string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(value));
  const name = org.displayName;
  const { review } = org;
  const failed =
    search.did === org.did &&
    (search.error === 'reasonRequired' || search.error === 'reasonTooLong')
      ? { action: search.action, message: t(`errors.${search.error}`, { max: MAX_REASON }) }
      : undefined;
  const reasonForm = (action: 'reject' | 'revoke') => (
    <details open={failed?.action === action} className="min-w-0 grow">
      <summary className={summary}>{t.rich(action, { name, hidden })}</summary>
      <form action={action === 'reject' ? rejectOrgAction : revokeOrgAction} className="mt-3">
        <input type="hidden" name="did" value={org.did} />
        {action === 'revoke' && <p className="mb-3">{t('revokeHint')}</p>}
        <TextArea
          id={`reason-${action}-${org.did}`}
          name="reason"
          label={t('reason')}
          hint={t('reasonHint')}
          error={failed?.action === action ? failed.message : undefined}
          rows={3}
        />
        <Button type="submit" variant="secondary">
          {t(action === 'reject' ? 'rejectAction' : 'revokeAction')}
        </Button>
      </form>
    </details>
  );

  return (
    <article
      id={`org-${org.did}`}
      aria-labelledby={`name-${org.did}`}
      className="rounded-lg border border-line bg-surface p-5"
    >
      <h3 id={`name-${org.did}`} className="text-lg font-bold">
        <Link href={`/org/${encodeURIComponent(org.handle ?? org.did)}`}>{name}</Link>
      </h3>
      <p className="mb-3 text-sm text-muted">
        {[org.handle && `@${org.handle}`, `${org.locality}, ${org.country}`]
          .filter(Boolean)
          .join(' · ')}
        {org.createdAt && <> · {t('created', { date: dateOf(org.createdAt) })}</>}
        {' · '}
        {t('listings', { count: org.listings })}
      </p>

      <p className="mb-3 flex flex-wrap items-center gap-2">
        {/* Words as well as tone, never colour alone. */}
        {review.state === 'approved' ? (
          <Badge tone="match">{t('stateApproved')}</Badge>
        ) : review.state === 'pending' ? (
          <Badge tone="unknown">
            {review.requestedAt
              ? t('askedAgain', { date: dateOf(review.requestedAt) })
              : t('statePending')}
          </Badge>
        ) : (
          <Badge tone="conflict">
            {t(review.state === 'rejected' ? 'stateRejected' : 'stateRevoked', {
              date: dateOf(review.decidedAt!),
            })}
          </Badge>
        )}
      </p>
      {review.reason && <p className="mb-3">{t('reasonGiven', { reason: review.reason })}</p>}

      <div className="mb-4">
        <OrgFacts
          handle={org.handle}
          facts={facts}
          email={emailFact({
            confirmation,
            currentEmail: profile?.profile.contact.email,
            ownDomain: facts?.domain?.handle === org.handle ? facts?.domain?.handle : undefined,
            website: profile?.profile.contact.website,
          })}
          charity={profile?.profile.charityRegistration}
          locale={locale}
          id={`facts-${org.did}`}
          heading="h4"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-start gap-x-6 gap-y-3">
        {review.state !== 'approved' && (
          <form action={approveOrgAction}>
            <input type="hidden" name="did" value={org.did} />
            <Button type="submit">{t.rich('approve', { name, hidden })}</Button>
          </form>
        )}
        {review.state === 'pending' && reasonForm('reject')}
        {review.state === 'approved' && reasonForm('revoke')}
      </div>

      {history.length > 0 && (
        <details>
          <summary className={summary}>{t('history', { count: history.length })}</summary>
          <ul className="mt-2 grid gap-1 text-sm">
            {history.map((entry, i) => (
              <li key={i}>
                {t(`historyEntry.${entry.action}`, {
                  date: dateOf(entry.at),
                  actor: entry.actorDid === moderator ? t('you') : entry.actorDid,
                })}
                {entry.reason && <span className="text-muted"> — {entry.reason}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
