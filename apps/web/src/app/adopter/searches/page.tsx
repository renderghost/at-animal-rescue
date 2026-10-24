import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { deleteSearchAction, renameSearchAction } from '@/app/actions/saved-searches';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { getPreferences } from '@/i18n/preferences';
import { MAX_NAME } from '@/lib/saved-search';
import { listSavedSearches } from '@/server/adopter/saved-searches';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SavedSearches');
  return { title: t('title') };
}

const hidden = (chunks: ReactNode) => <span className="sr-only">{chunks}</span>;
const summary = 'cursor-pointer text-accent underline underline-offset-[0.15em]';

/**
 * An adopter's saved searches (#41): open, rename or delete. Anyone signed in who isn't an
 * organisation can manage searches they saved, so none are stranded if they clear their
 * answers; saving itself is for adopters, on Discover.
 */
export default async function SavedSearchesPage({
  searchParams,
}: {
  searchParams: Promise<{ renamed?: string; deleted?: string; error?: string; rkey?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if ((await getCurrentRole()) === 'organisation') redirect('/organisation');
  const { distanceUnit, formatLocale: locale } = await getPreferences();
  const searches = await listSavedSearches(user.did, distanceUnit);
  const { renamed, deleted, error, rkey } = await searchParams;
  const t = await getTranslations('SavedSearches');
  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso));
  const nameError =
    error === 'nameRequired' || error === 'nameTooLong'
      ? t(`errors.${error}`, { max: MAX_NAME })
      : undefined;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-6">{t('intro')}</p>

      {(renamed || deleted) && (
        <p role="status" className="mb-6 rounded-md border border-line bg-sunken p-4">
          {renamed ? t('renamed') : t('deleted')}
        </p>
      )}

      {searches.length === 0 ? (
        <p>{t.rich('none', { link: (chunks) => <Link href="/discover">{chunks}</Link> })}</p>
      ) : (
        <ul className="grid gap-4">
          {searches.map((search) => {
            const failed = rkey === search.rkey ? nameError : undefined;
            return (
              <li
                key={search.rkey}
                id={`search-${search.rkey}`}
                className="rounded-lg border border-line bg-surface p-5"
              >
                <h2 className="text-lg font-bold">{search.name}</h2>
                <p className="mb-3 text-sm text-muted">
                  {t('savedOn', { date: dateOf(search.createdAt) })}
                </p>
                <p className="mb-3">
                  <Link href={`/discover${search.query}`}>
                    {t.rich('open', { name: search.name, hidden })}
                  </Link>
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {/* Two deliberate steps, without JavaScript, as on the dashboard. */}
                  <details open={Boolean(failed)} className="min-w-0 grow">
                    <summary className={summary}>
                      {t.rich('rename', { name: search.name, hidden })}
                    </summary>
                    <form action={renameSearchAction} className="mt-3">
                      <input type="hidden" name="rkey" value={search.rkey} />
                      <Field
                        id={`name-${search.rkey}`}
                        name="name"
                        label={t('name')}
                        defaultValue={search.name}
                        error={failed}
                        autoComplete="off"
                      />
                      <Button type="submit" variant="secondary">
                        {t('renameSave')}
                      </Button>
                    </form>
                  </details>
                  <details className="min-w-0 grow">
                    <summary className={summary}>
                      {t.rich('delete', { name: search.name, hidden })}
                    </summary>
                    <form action={deleteSearchAction} className="mt-3">
                      <input type="hidden" name="rkey" value={search.rkey} />
                      <p className="mb-3">{t('deleteConfirm', { name: search.name })}</p>
                      <Button type="submit" variant="secondary">
                        {t('deleteAction')}
                      </Button>
                    </form>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
