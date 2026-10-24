import { isValidTid } from '@atproto/syntax';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { crossPostAction, deleteListingDraftAction } from '@/app/actions/listings';
import { Button, ButtonLink } from '@/components/Button';
import { CriteriaList } from '@/components/CriteriaList';
import { CrossPostFields } from '@/components/CrossPostFields';
import { ExampleHomes } from '@/components/ExampleHomes';
import { ListingForm } from '@/components/ListingForm';
import { WelfareNote } from '@/components/WelfareNotes';
import { getPreferences } from '@/i18n/preferences';
import { listAnimals } from '@/server/animals/animals';
import { requireOrganisation } from '@/server/animals/current-org';
import { editorOptions } from '@/server/listings/editor-options';
import { listingTitle, listingToFormValues } from '@/server/listings/listing-form';
import { suggestedPostText } from '@/server/listings/cross-post';
import { loadListing } from '@/server/listings/listings';
import { postUrl } from '@/server/listings/post-text';

type Props = {
  params: Promise<{ rkey: string }>;
  searchParams: Promise<{
    created?: string;
    published?: string;
    posted?: string;
    postError?: string;
  }>;
};

async function load(rkey: string) {
  if (!isValidTid(rkey)) notFound();
  const { did, client } = await requireOrganisation();
  return { did, client, listing: await loadListing(did, client, rkey) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { did, client, listing } = await load((await params).rkey);
  if (listing.kind !== 'found') return {};
  const t = await getTranslations('ListingEditor');
  const { animals } = await listAnimals(did, client);
  return {
    title: t('editTitle', {
      title: listingTitle(did, listing.record, animals, (await getPreferences()).formatLocale),
    }),
  };
}

export default async function EditListingPage({ params, searchParams }: Props) {
  const { rkey } = await params;
  const { did, client, listing } = await load(rkey);
  if (listing.kind === 'missing') notFound();
  const t = await getTranslations('ListingEditor');
  const { created, published: justPublished, posted, postError } = await searchParams;
  const crossPost = await getTranslations('CrossPost');

  if (listing.kind === 'unavailable') {
    return (
      <div className="max-w-2xl">
        <p className="mb-4">
          <Link href="/organisation">{t('backToList')}</Link>
        </p>
        <p
          role="alert"
          className="rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
        >
          {t('publishFailed')}
        </p>
      </div>
    );
  }

  const options = await editorOptions(did, client, rkey);
  const { record, published } = listing;
  const criteria = record.criteria ?? [];

  return (
    <div className="max-w-2xl">
      <p className="mb-4">
        <Link href="/organisation">{t('backToList')}</Link>
      </p>
      <h1 className="mb-6 text-3xl font-bold">
        {t('editTitle', {
          title: listingTitle(did, record, options.animals, (await getPreferences()).formatLocale),
        })}
      </h1>
      {(justPublished || posted) && (
        <p
          role="status"
          className="mb-6 rounded-md border border-match-line bg-match-soft p-4 text-match"
        >
          {justPublished && t('published')} {posted && crossPost('posted')}
        </p>
      )}
      {justPublished && postError && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
        >
          {crossPost('publishedNotPosted')}
        </p>
      )}
      <WelfareNote kind="listing" />
      <ListingForm
        rkey={rkey}
        initialValues={listingToFormValues(did, record)}
        published={published}
        justCreated={Boolean(created)}
        animals={options.animals}
        countries={options.countries}
        currencies={options.currencies}
        defaultCurrency={options.defaultCurrency}
      />

      <section aria-labelledby="preview" className="mt-12 border-t border-line pt-6">
        <h2 id="preview" className="mb-1 text-xl font-bold">
          {t('previewHeading')}
        </h2>
        <p className="mb-4 text-muted">{t('previewHint')}</p>
        {criteria.length > 0 ? <CriteriaList criteria={criteria} /> : <p>{t('previewNone')}</p>}
        <ExampleHomes criteria={criteria} />
      </section>

      {published && (
        <section aria-labelledby="bluesky" className="mt-12 border-t border-line pt-6">
          <h2 id="bluesky" className="mb-2 text-xl font-bold">
            {crossPost('heading')}
          </h2>
          {record.crossPost ? (
            <p>
              {crossPost('posted')}{' '}
              <a href={postUrl(record.crossPost.uri)}>{crossPost('viewPost')}</a>
            </p>
          ) : (
            <form action={crossPostAction}>
              <input type="hidden" name="$rkey" value={rkey} />
              <p className="mb-4">{crossPost('editorBody')}</p>
              <CrossPostFields
                suggested={await suggestedPostText(did, client, rkey)}
                error={postError}
              />
              <Button type="submit">{crossPost('post')}</Button>
            </form>
          )}
        </section>
      )}

      {!published && (
        <>
          <section aria-labelledby="publish" className="mt-12 border-t border-line pt-6">
            <h2 id="publish" className="mb-2 text-xl font-bold">
              {t('publishHeading')}
            </h2>
            <p className="mb-4">{t('publishBody')}</p>
            <ButtonLink href={`/organisation/listings/${rkey}/publish`}>
              {t('previewAndPublish')}
            </ButtonLink>
          </section>
          {/* Two deliberate steps, without JavaScript: open the panel, then confirm. */}
          <details className="mt-12 border-t border-line pt-6">
            <summary className="cursor-pointer text-xl font-bold">{t('deleteHeading')}</summary>
            <p className="mt-4 mb-4 text-muted">{t('deleteBody')}</p>
            <form action={deleteListingDraftAction}>
              <input type="hidden" name="$rkey" value={rkey} />
              <Button type="submit" variant="secondary">
                {t('deleteAction')}
              </Button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
