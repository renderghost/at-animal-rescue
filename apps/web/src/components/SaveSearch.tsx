import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { saveSearchAction } from '@/app/actions/saved-searches';
import { MAX_NAME, MAX_SAVED_SEARCHES } from '@/lib/saved-search';
import { Button } from './Button';
import { Field } from './Field';
import { FormAlert } from './FormAlert';

export type SaveStatus = 'saved' | 'full' | 'nameRequired' | 'nameTooLong';

/** "Save this search" under Discover's filters, for adopters (#41). Works without JavaScript. */
export async function SaveSearch({
  query,
  suggestedName,
  count,
  status,
}: {
  /** Discover's query string for the current filters. */
  query: string;
  suggestedName: string;
  /** How many searches they've saved already. */
  count: number;
  status?: SaveStatus;
}) {
  const t = await getTranslations('SavedSearches');
  const nameError =
    status === 'nameRequired' || status === 'nameTooLong'
      ? t(`errors.${status}`, { max: MAX_NAME })
      : undefined;
  return (
    <section
      id="save-search"
      aria-labelledby="save-search-heading"
      className="mt-8 rounded-lg border border-line bg-surface p-4"
    >
      <h2 id="save-search-heading" className="mb-1 text-lg font-bold">
        {t('saveHeading')}
      </h2>
      <p className="mb-4 text-sm text-muted">{t('saveHint')}</p>
      {status === 'saved' && (
        <p
          role="status"
          className="mb-4 rounded-md border border-match-line bg-match-soft p-3 text-match"
        >
          {t('saved')}
        </p>
      )}
      {status === 'full' && <FormAlert>{t('errors.full', { max: MAX_SAVED_SEARCHES })}</FormAlert>}
      <form action={saveSearchAction}>
        <input type="hidden" name="query" value={query} />
        <Field
          id="save-search-name"
          name="name"
          label={t('name')}
          defaultValue={suggestedName}
          error={nameError}
          autoComplete="off"
        />
        <Button type="submit" variant="secondary">
          {t('save')}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/adopter/searches">{t('yours', { count })}</Link>
      </p>
    </section>
  );
}
