import { findOrg, type ListingHide } from '@homeward/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { requestReviewAction } from '@/app/actions/admin';
import { appealHideAction } from '@/app/actions/reports';
import { changeStatusAction, deleteListingAction } from '@/app/actions/listings';
import { Badge } from '@/components/Badge';
import { Button, ButtonLink } from '@/components/Button';
import { TextArea } from '@/components/Field';
import { getPreferences } from '@/i18n/preferences';
import { MAX_APPEAL } from '@/lib/reports';
import { orgReviews } from '@/server/admin/admin';
import { requireOrganisation } from '@/server/animals/current-org';
import { getDb } from '@/server/db';
import { isoDate } from '@/server/listings/lifecycle';
import { listListings, type ListingSummary } from '@/server/listings/listings';
import { listingReports } from '@/server/reports/reports';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Dashboard');
  return { title: t('title') };
}

type SearchParams = {
  changed?: string;
  listing?: string;
  error?: string;
  deleted?: string;
  removed?: string;
  reviewRequested?: string;
  appealed?: string;
  appealError?: string;
};

const GROUPS = ['available', 'reserved', 'draft', 'adopted', 'withdrawn'] as const;
const CHANGES = ['available', 'reserved', 'adopted', 'withdrawn'] as const;
const ERRORS = ['missing', 'notAllowed', 'conflict', 'invalidDate', 'unavailable'] as const;

/** A status change that needs a second, deliberate step: open the panel, then confirm. */
function Confirm({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="w-full">
      <summary className="cursor-pointer font-semibold">{summary}</summary>
      <div className="mt-3 rounded-md border border-line bg-sunken p-4">{children}</div>
    </details>
  );
}

/** The organisation's dashboard (#34): review state, listings by status and free animals. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { did, client } = await requireOrganisation();
  const [{ listings, unlisted, pdsUnavailable }, org, hides, review] = await Promise.all([
    listListings(did, client),
    findOrg(getDb(), { did }),
    listingReports().hidesOf(did),
    orgReviews().get(did),
  ]);
  const rkeyOf = (hide: ListingHide) => hide.listingUri.split('/').pop()!;
  const hidden = hides.map(rkeyOf);
  const t = await getTranslations('Dashboard');
  const { formatLocale: locale } = await getPreferences();
  const params = await searchParams;
  const and = new Intl.ListFormat(locale, { type: 'conjunction' });
  const titleOf = (listing: ListingSummary) => listing.title ?? and.format(listing.animals);
  const named = listings.find((listing) => listing.rkey === params.listing);
  const changed = CHANGES.find((status) => status === params.changed);
  const error = ERRORS.find((reason) => reason === params.error);
  const today = isoDate(new Date());
  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));

  const groupOf = (listing: ListingSummary) =>
    !listing.published
      ? 'draft'
      : (GROUPS as readonly string[]).includes(listing.status)
        ? listing.status
        : 'other';
  const groups = [...GROUPS, 'other' as const]
    .map((group) => ({ group, items: listings.filter((listing) => groupOf(listing) === group) }))
    .filter(({ items }) => items.length > 0);

  const statusForm = (rkey: string, to: string, label: string, variant?: 'secondary') => (
    <form action={changeStatusAction}>
      <input type="hidden" name="$rkey" value={rkey} />
      <input type="hidden" name="to" value={to} />
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );

  const actions = (listing: ListingSummary) => {
    const { rkey } = listing;
    const adopt = (
      <Confirm summary={t('markAdopted')}>
        <form action={changeStatusAction}>
          <input type="hidden" name="$rkey" value={rkey} />
          <input type="hidden" name="to" value="adopted" />
          <div className="mb-4 grid gap-1">
            <label htmlFor={`adopted-${rkey}`} className="font-semibold">
              {t('adoptedDate')}
            </label>
            <span id={`adopted-${rkey}-hint`} className="text-sm text-muted">
              {t('adoptedDateHint')}
            </span>
            <input
              id={`adopted-${rkey}`}
              type="date"
              name="adoptedAt"
              defaultValue={today}
              max={today}
              aria-describedby={`adopted-${rkey}-hint`}
              className="min-h-11 w-fit rounded-sm border border-line-strong bg-surface px-3 py-2 text-base text-fg"
            />
          </div>
          <Button type="submit">{t('confirmAdopted')}</Button>
        </form>
      </Confirm>
    );
    const withdraw = (
      <Confirm summary={t('withdraw')}>
        <p className="mb-3">{t('withdrawBody')}</p>
        {statusForm(rkey, 'withdrawn', t('confirmWithdraw'), 'secondary')}
      </Confirm>
    );
    switch (groupOf(listing)) {
      case 'draft':
        return (
          <Link href={`/organisation/listings/${rkey}/publish`}>{t('previewAndPublish')}</Link>
        );
      case 'available':
        return (
          <>
            {statusForm(rkey, 'reserved', t('markReserved'), 'secondary')}
            {adopt}
            {withdraw}
          </>
        );
      case 'reserved':
        return (
          <>
            {statusForm(rkey, 'available', t('markAvailable'), 'secondary')}
            {adopt}
            {withdraw}
          </>
        );
      case 'withdrawn':
        return (
          <>
            {statusForm(rkey, 'available', t('relist'), 'secondary')}
            <Confirm summary={t('delete')}>
              <p className="mb-3">{t('deleteBody')}</p>
              <form action={deleteListingAction}>
                <input type="hidden" name="$rkey" value={rkey} />
                <Button type="submit" variant="secondary">
                  {t('confirmDelete')}
                </Button>
              </form>
            </Confirm>
          </>
        );
      case 'adopted':
        return (
          <Confirm summary={t('fellThrough')}>
            <p className="mb-3">{t('fellThroughBody')}</p>
            {statusForm(rkey, 'available', t('confirmFellThrough'), 'secondary')}
          </Confirm>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-6 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/organisation/profile">{t('editProfile')}</Link>
        <Link href={`/org/${encodeURIComponent(did)}`}>{t('viewPublic')}</Link>
        <Link href="/organisation/animals">{t('allAnimals')}</Link>
      </p>

      {changed && named && (
        <p
          role="status"
          className="mb-6 rounded-md border border-match-line bg-match-soft p-4 text-match"
        >
          {t(`changed.${changed}`, { title: titleOf(named) })}
        </p>
      )}
      {(params.deleted || params.removed) && (
        <p role="status" className="mb-6 rounded-md border border-line bg-sunken p-4">
          {params.deleted ? t('deletedDraft') : t('deletedListing')}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
        >
          {t(`errors.${error}`)}
        </p>
      )}

      <section aria-labelledby="review" className="mb-10">
        <h2 id="review" className="mb-3 text-xl font-bold">
          {t('review')}
        </h2>
        {params.reviewRequested && (
          <p role="status" className="mb-2 rounded-md border border-line bg-sunken p-4">
            {t('reviewRequested')}
          </p>
        )}
        {org?.approved ? (
          <p className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="match">{t('approved')}</Badge>
          </p>
        ) : review.state === 'rejected' || review.state === 'revoked' ? (
          // The moderator's decision and reason, and the way back into the queue (#43).
          <div className="mb-2 rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict">
            <p className="font-semibold">
              {review.state === 'rejected'
                ? t('notApprovedYet')
                : t('approvalRevoked', { date: dateOf(isoDate(review.decidedAt!)) })}
            </p>
            {review.reason && (
              <p className="mb-2">{t('moderatorReason', { reason: review.reason })}</p>
            )}
            <p className="mb-3">{t('askAgainHint')}</p>
            <form action={requestReviewAction}>
              <Button type="submit" variant="secondary">
                {t('askAgain')}
              </Button>
            </form>
          </div>
        ) : (
          <p className="mb-2 rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown">
            {review.requestedAt
              ? t('askedAgain', { date: dateOf(isoDate(review.requestedAt)) })
              : t('awaitingReview')}
          </p>
        )}
        {hidden.length > 0 && (
          <p className="rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict">
            {t.rich('hiddenCount', {
              count: hidden.length,
              link: (chunks) => <a href="#hidden">{chunks}</a>,
            })}
          </p>
        )}
      </section>

      {hides.length > 0 && (
        // The statement of reasons and the way to contest it (#44, DSA Arts. 17 and 20).
        <section aria-labelledby="hidden" className="mb-10">
          <h2 id="hidden" className="mb-3 text-xl font-bold">
            {t('hiddenHeading')}
          </h2>
          <p className="mb-4 max-w-prose">{t('hiddenIntro')}</p>
          <ul className="grid gap-4">
            {hides.map((hide) => {
              const rkey = rkeyOf(hide);
              const listing = listings.find((item) => item.rkey === rkey);
              const title = listing ? titleOf(listing) : rkey;
              const appealError =
                params.listing === rkey &&
                (params.appealError === 'required' || params.appealError === 'tooLong')
                  ? t(`appealErrors.${params.appealError}`, { max: MAX_APPEAL })
                  : undefined;
              return (
                <li
                  key={hide.listingUri}
                  id={`hidden-${rkey}`}
                  className="rounded-lg border border-conflict-line bg-surface p-4"
                >
                  <h3 className="text-lg font-bold">
                    {listing ? <Link href={`/organisation/listings/${rkey}`}>{title}</Link> : title}
                  </h3>
                  <p className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone="conflict">{t('hidden')}</Badge>
                    <span className="text-muted">
                      {t('hiddenOn', { date: dateOf(isoDate(hide.decidedAt)) })}
                    </span>
                  </p>
                  <p className="mb-2">
                    {t.rich(`hiddenGround.${hide.ground}`, {
                      link: (chunks) => <Link href="/guidelines">{chunks}</Link>,
                    })}
                  </p>
                  <h4 className="font-semibold">{t('statementLabel')}</h4>
                  <p className="mb-4 rounded-md border border-line bg-sunken p-4 whitespace-pre-line">
                    {hide.statement}
                  </p>
                  {params.appealed === rkey && (
                    <p role="status" className="mb-3 rounded-md border border-line bg-sunken p-4">
                      {t('appealSent')}
                    </p>
                  )}
                  {!hide.appealedAt ? (
                    <details open={Boolean(appealError)}>
                      <summary className="cursor-pointer font-semibold">{t('appeal')}</summary>
                      <form action={appealHideAction} className="mt-3">
                        <input type="hidden" name="uri" value={hide.listingUri} />
                        <TextArea
                          id={`appeal-${rkey}`}
                          name="appeal"
                          label={t('appealLabel')}
                          hint={t('appealHint')}
                          error={appealError}
                          rows={4}
                        />
                        <Button type="submit" variant="secondary">
                          {t('appealAction')}
                        </Button>
                      </form>
                    </details>
                  ) : !hide.appealDecidedAt ? (
                    <p className="text-muted">
                      {t('appealedOn', { date: dateOf(isoDate(hide.appealedAt)) })}
                    </p>
                  ) : (
                    <>
                      <p className="mb-2">
                        {t('upheldOn', {
                          date: dateOf(isoDate(hide.appealDecidedAt)),
                          note: hide.appealNote ?? '',
                        })}
                      </p>
                      <p className="text-sm text-muted">{t('redress')}</p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="listings" className="mb-10">
        <h2 id="listings" className="mb-3 text-xl font-bold">
          {t('listings')}
        </h2>
        {pdsUnavailable && (
          <p className="mb-4 rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown">
            {t('pdsUnavailable')}
          </p>
        )}
        <ButtonLink href="/organisation/listings/new" className="mb-6">
          {t('addListing')}
        </ButtonLink>
        {groups.length === 0 && <p>{t('noListings')}</p>}
        {groups.map(({ group, items }) => (
          <section key={group} aria-labelledby={`group-${group}`} className="mb-8">
            <h3 id={`group-${group}`} className="mb-3 text-lg font-bold">
              {t(`groups.${group}`)} ({items.length})
            </h3>
            <ul className="grid gap-3">
              {items.map((listing) => {
                const title = titleOf(listing);
                return (
                  <li
                    key={listing.rkey}
                    id={`listing-${listing.rkey}`}
                    className="rounded-lg border border-line bg-surface p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <Link
                          href={`/organisation/listings/${listing.rkey}`}
                          className="text-lg font-bold"
                          aria-label={t('editListing', { title })}
                        >
                          {title}
                        </Link>
                        {listing.title && (
                          <p className="text-muted">{and.format(listing.animals)}</p>
                        )}
                        {listing.status === 'adopted' && listing.adoptedAt && (
                          <p className="text-muted">
                            {t('adoptedOn', { date: dateOf(listing.adoptedAt) })}
                          </p>
                        )}
                      </div>
                      {hidden.includes(listing.rkey) && (
                        <Badge tone="conflict">{t('hidden')}</Badge>
                      )}
                    </div>
                    <div
                      role="group"
                      aria-label={t('actionsFor', { title })}
                      className="flex flex-wrap items-start gap-3"
                    >
                      {actions(listing)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>

      <section aria-labelledby="animals">
        <h2 id="animals" className="mb-3 text-xl font-bold">
          {t('animals')}
        </h2>
        <ButtonLink href="/organisation/animals/new" variant="secondary" className="mb-6">
          {t('addAnimal')}
        </ButtonLink>
        {unlisted.length === 0 ? (
          <p>{t('noUnlisted')}</p>
        ) : (
          <ul className="grid gap-3">
            {unlisted.map((animal) => (
              <li
                key={animal.rkey}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4"
              >
                <div>
                  <Link href={`/organisation/animals/${animal.rkey}`} className="font-bold">
                    {animal.name}
                  </Link>{' '}
                  <span className="text-muted">
                    ({animal.published ? t('animalPublic') : t('animalDraft')})
                  </span>
                </div>
                <Link href={`/organisation/listings/new?animal=${animal.rkey}`}>
                  {t('listAnimal', { name: animal.name })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
