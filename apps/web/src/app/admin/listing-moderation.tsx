import type { ListingHide, ListingReport } from '@homeward/db';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  dismissReportAction,
  hideListingAction,
  reinstateListingAction,
  upholdHideAction,
} from '@/app/actions/reports';
import { Button } from '@/components/Button';
import { RadioGroup } from '@/components/Choices';
import { Select, TextArea } from '@/components/Field';
import { getPreferences } from '@/i18n/preferences';
import {
  DSA_CATEGORIES,
  isReportReason,
  MAX_STATEMENT,
  REASON_CATEGORY,
  REASON_GROUND,
} from '@/lib/reports';
import { describeListing, listingReports } from '@/server/reports/reports';

export type ModerationSearch = { error?: string; action?: string; target?: string };

const hidden = (chunks: ReactNode) => <span className="sr-only">{chunks}</span>;
const summary = 'cursor-pointer text-accent underline underline-offset-[0.15em]';
const CATEGORY_PREFIX = 'STATEMENT_CATEGORY_';

async function formatting() {
  const t = await getTranslations('Admin');
  const report = await getTranslations('Report');
  const { formatLocale: locale } = await getPreferences();
  const dateOf = (value: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(value);
  return { t, report, locale, dateOf };
}

/** The error for one form, when the console was sent back to it. */
async function failure(search: ModerationSearch, action: string, target: string) {
  if (search.action !== action || search.target !== target || !search.error) return undefined;
  const t = await getTranslations('Admin');
  return t.has(`errors.${search.error}` as never)
    ? t(`errors.${search.error}` as never, { max: MAX_STATEMENT } as never)
    : undefined;
}

async function History({ uri, moderator }: { uri: string; moderator: string }) {
  const { t, dateOf } = await formatting();
  const history = await listingReports().history(uri);
  if (history.length === 0) return null;
  return (
    <details>
      <summary className={summary}>{t('history', { count: history.length })}</summary>
      <ul className="mt-2 grid gap-1 text-sm">
        {history.map((entry, i) => (
          <li key={i}>
            {t(`listingHistoryEntry.${entry.action}`, {
              date: dateOf(entry.at),
              actor: entry.actorDid === moderator ? t('you') : (entry.actorDid ?? ''),
            })}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** One listing's open reports, with the decision: hide it, or close each report. */
export async function ReportedListing({
  uri,
  reports,
  moderator,
  search,
}: {
  uri: string;
  reports: ListingReport[];
  moderator: string;
  search: ModerationSearch;
}) {
  const { t, report: r, locale, dateOf } = await formatting();
  const listing = await describeListing(uri, locale);
  const title = listing?.title ?? uri;
  const first = reports[0]!;
  const reason = isReportReason(first.reason) ? first.reason : 'otherIllegal';
  const hideError = await failure(search, 'hide', uri);

  return (
    <article
      id={`reported-${uri}`}
      aria-labelledby={`reported-title-${uri}`}
      className="rounded-lg border border-line bg-surface p-5"
    >
      <h3 id={`reported-title-${uri}`} className="text-lg font-bold">
        {listing ? <Link href={listing.path}>{title}</Link> : title}
      </h3>
      <p className="mb-3 text-sm text-muted">
        {listing ? t('byOrg', { name: listing.orgName }) : t('listingGone')}
        {' · '}
        {t('reportCount', { count: reports.length })}
      </p>

      <ul className="mb-4 grid gap-3">
        {await Promise.all(
          reports.map(async (report) => {
            const error = await failure(search, 'dismiss', report.id);
            return (
              <li
                key={report.id}
                id={`report-${report.id}`}
                className="rounded-md border border-line bg-sunken p-4"
              >
                <p className="font-semibold">
                  {isReportReason(report.reason)
                    ? r(`reasons.${report.reason}.label`)
                    : report.reason}
                </p>
                <p className="mb-2 text-sm text-muted">
                  {t('reportMeta', { date: dateOf(report.createdAt), reference: report.reference })}
                </p>
                <p className="mb-2 whitespace-pre-line">{report.explanation}</p>
                {report.reporterName && (
                  <p className="text-sm">{t('reporterName', { name: report.reporterName })}</p>
                )}
                <p className="mb-3 text-sm text-muted">
                  {report.reporterEmail ? t('contactEmail') : t('contactNone')}
                </p>
                <details open={Boolean(error)}>
                  <summary className={summary}>
                    {t.rich('dismiss', { reference: report.reference, hidden })}
                  </summary>
                  <form action={dismissReportAction} className="mt-3">
                    <input type="hidden" name="id" value={report.id} />
                    <TextArea
                      id={`dismiss-${report.id}`}
                      name="note"
                      label={t('dismissNote')}
                      hint={t('dismissHint')}
                      error={error}
                      rows={3}
                    />
                    <Button type="submit" variant="secondary">
                      {t('dismissAction')}
                    </Button>
                  </form>
                </details>
              </li>
            );
          }),
        )}
      </ul>

      {listing && (
        <details open={Boolean(hideError)} className="mb-4">
          <summary className={summary}>{t.rich('hide', { title, hidden })}</summary>
          <form action={hideListingAction} className="mt-3">
            <input type="hidden" name="uri" value={uri} />
            <p className="mb-3">{t('hideHint')}</p>
            {hideError && (
              <p role="alert" className="mb-3 text-sm font-semibold text-danger">
                {hideError}
              </p>
            )}
            <Select
              id={`category-${uri}`}
              name="category"
              label={t('category')}
              hint={t('categoryHint')}
              defaultValue={REASON_CATEGORY[reason] ?? ''}
            >
              <option value="">{t('categoryChoose')}</option>
              {DSA_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {r(`categories.${category}`)}
                </option>
              ))}
            </Select>
            <RadioGroup
              name="ground"
              legend={t('ground')}
              defaultValue={REASON_GROUND[reason]}
              options={(['illegal', 'terms'] as const).map((ground) => ({
                value: ground,
                label: r(`grounds.${ground}`),
              }))}
            />
            <TextArea
              id={`statement-${uri}`}
              name="statement"
              label={t('statement')}
              hint={t('statementHint')}
              rows={5}
            />
            <Button type="submit">{t('hideAction')}</Button>
          </form>
        </details>
      )}

      <History uri={uri} moderator={moderator} />
    </article>
  );
}

/** A hidden listing whose organisation asked for a second look: reinstate or uphold. */
export async function SecondLook({
  hide,
  moderator,
  search,
}: {
  hide: ListingHide;
  moderator: string;
  search: ModerationSearch;
}) {
  const { t, report: r, locale, dateOf } = await formatting();
  const uri = hide.listingUri;
  const listing = await describeListing(uri, locale);
  const title = listing?.title ?? uri;
  const category = hide.category.replace(CATEGORY_PREFIX, '');
  const errors = {
    reinstate: await failure(search, 'reinstate', uri),
    uphold: await failure(search, 'uphold', uri),
  };
  const noteForm = (action: 'reinstate' | 'uphold') => (
    <details open={Boolean(errors[action])} className="min-w-0 grow">
      <summary className={summary}>{t.rich(action, { title, hidden })}</summary>
      <form
        action={action === 'reinstate' ? reinstateListingAction : upholdHideAction}
        className="mt-3"
      >
        <input type="hidden" name="uri" value={uri} />
        <TextArea
          id={`${action}-${uri}`}
          name="note"
          label={t(action === 'reinstate' ? 'reinstateNote' : 'upholdNote')}
          hint={t(action === 'reinstate' ? 'reinstateHint' : 'upholdHint')}
          error={errors[action]}
          rows={3}
        />
        <Button type="submit" variant={action === 'reinstate' ? undefined : 'secondary'}>
          {t(action === 'reinstate' ? 'reinstateAction' : 'upholdAction')}
        </Button>
      </form>
    </details>
  );

  return (
    <article
      id={`appeal-${uri}`}
      aria-labelledby={`appeal-title-${uri}`}
      className="rounded-lg border border-line bg-surface p-5"
    >
      <h3 id={`appeal-title-${uri}`} className="text-lg font-bold">
        {listing ? <Link href={listing.path}>{title}</Link> : title}
      </h3>
      {listing && (
        <p className="mb-3 text-sm text-muted">{t('byOrg', { name: listing.orgName })}</p>
      )}
      <p className="mb-1 text-sm">
        {t('hiddenOn', {
          date: dateOf(hide.decidedAt),
          category: r.has(`categories.${category}` as never)
            ? r(`categories.${category}` as never)
            : category,
          ground: r(`grounds.${hide.ground}`),
        })}
      </p>
      <p className="mb-3 whitespace-pre-line">
        {t('statementGiven', { statement: hide.statement })}
      </p>
      <p className="font-semibold">{t('appealedOn', { date: dateOf(hide.appealedAt!) })}</p>
      <p className="mb-4 rounded-md border border-line bg-sunken p-4 whitespace-pre-line">
        {hide.appealText}
      </p>
      <div className="mb-4 flex flex-wrap items-start gap-x-6 gap-y-3">
        {noteForm('reinstate')}
        {noteForm('uphold')}
      </div>
      <History uri={uri} moderator={moderator} />
    </article>
  );
}
