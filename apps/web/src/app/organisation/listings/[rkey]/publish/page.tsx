import { isValidTid } from '@atproto/syntax';
import { findOrg } from '@homeward/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { publishListingAction } from '@/app/actions/listings';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { CriteriaList } from '@/components/CriteriaList';
import { FormAlert } from '@/components/FormAlert';
import { getPreferences } from '@/i18n/preferences';
import { formatMoney } from '@/lib/format';
import { listAnimals, loadAnimal, photoCid } from '@/server/animals/animals';
import { requireOrganisation } from '@/server/animals/current-org';
import { getDb } from '@/server/db';
import { animalKey, listingTitle, publishProblems } from '@/server/listings/listing-form';
import { loadListing } from '@/server/listings/listings';

type Props = {
  params: Promise<{ rkey: string }>;
  searchParams: Promise<{ error?: string }>;
};

const ERRORS = ['missing', 'notReady', 'conflict', 'unavailable', 'photoMissing'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ListingPublish');
  return { title: t('title') };
}

/** The listing as adopters will see it, what becomes public, and the button to publish. */
export default async function PublishListingPage({ params, searchParams }: Props) {
  const { rkey } = await params;
  if (!isValidTid(rkey)) notFound();
  const { did, client } = await requireOrganisation();
  const listing = await loadListing(did, client, rkey);
  if (listing.kind === 'missing') notFound();
  if (listing.kind === 'found' && listing.published) redirect(`/organisation/listings/${rkey}`);
  const t = await getTranslations('ListingPublish');
  const taxonomy = await getTranslations('Taxonomy');
  const { formatLocale: locale } = await getPreferences();
  const { error } = await searchParams;
  const shownError = ERRORS.find((reason) => reason === error);
  const back = (
    <p className="mb-4">
      <Link href={`/organisation/listings/${rkey}`}>{t('backToEdit')}</Link>
    </p>
  );
  if (listing.kind === 'unavailable') {
    return (
      <div className="max-w-2xl">
        {back}
        <FormAlert>{t('errors.unavailable')}</FormAlert>
      </div>
    );
  }

  const { record } = listing;
  const [{ animals: summaries }, org] = await Promise.all([
    listAnimals(did, client),
    findOrg(getDb(), { did }),
  ]);
  const animals = await Promise.all(
    record.animals.map(async (uri) => {
      const key = animalKey(did, uri) ?? '';
      const found = await loadAnimal(did, client, key);
      return { key, animal: found.kind === 'found' ? found : undefined };
    }),
  );
  const label = (group: string, value: string | undefined) =>
    value && taxonomy.has(`${group}.${value}` as never)
      ? taxonomy(`${group}.${value}` as never)
      : value;
  const problems = publishProblems(record);
  const fee = record.adoptionFee;
  const amount = fee?.amount && formatMoney(fee.amount.amount, fee.amount.currency, locale);
  const place =
    record.location &&
    [record.location.locality, record.location.region].filter(Boolean).join(', ');

  return (
    <div className="max-w-2xl">
      {back}
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-8 max-w-prose">{t('intro')}</p>
      {shownError && <FormAlert>{t(`errors.${shownError}`)}</FormAlert>}

      <article className="mb-10 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-2 text-2xl font-bold">{listingTitle(did, record, summaries, locale)}</h2>
        {record.summary && <p className="mb-4">{record.summary}</p>}
        <div className="mb-4 flex flex-wrap gap-2">
          {record.animals.length > 1 && record.bonded !== undefined && (
            <Badge>{record.bonded ? t('bonded') : t('separately')}</Badge>
          )}
        </div>
        <ul className="mb-6 grid gap-4">
          {animals.map(({ key, animal }) => {
            if (!animal) return null;
            const a = animal.record;
            const cover = a.photos?.[0];
            return (
              <li key={key} className="flex flex-wrap gap-4">
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element -- owner-only preview
                  <img
                    src={`/organisation/animals/${key}/photos/${photoCid(cover)}`}
                    alt={cover.alt}
                    width={cover.aspectRatio?.width}
                    height={cover.aspectRatio?.height}
                    className="h-auto max-h-40 w-auto max-w-full rounded-sm border border-line"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold">{a.name}</h3>
                  <p className="text-muted">
                    {[
                      label('species', a.species),
                      a.sex !== 'unknown' && label('sex', a.sex),
                      label('size', a.size),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {a.story && <p className="mt-2 line-clamp-3">{a.story}</p>}
                </div>
              </li>
            );
          })}
        </ul>
        {fee && (
          <p className="mb-2">
            {fee.kind === 'none'
              ? t('fee.none')
              : fee.kind === 'donation'
                ? amount
                  ? t('fee.donationAmount', { amount })
                  : t('fee.donation')
                : t('fee.fee', { amount: amount ?? '' })}
          </p>
        )}
        {place && <p className="mb-4">{t('location', { place })}</p>}
        {record.criteria && record.criteria.length > 0 && (
          <>
            <h3 className="mb-2 text-lg font-bold">{t('criteria')}</h3>
            <CriteriaList criteria={record.criteria} />
          </>
        )}
      </article>

      <section aria-labelledby="public" className="mb-10">
        <h2 id="public" className="mb-3 text-xl font-bold">
          {t('becomesPublic')}
        </h2>
        <ul className="mb-3 list-disc pl-6">
          {animals.map(({ key, animal }) =>
            animal ? (
              <li key={key}>
                {animal.published
                  ? t('publicAnimalAlready', { name: animal.record.name })
                  : t('publicAnimal', { name: animal.record.name })}
              </li>
            ) : null,
          )}
          <li>{t('publicListing')}</li>
        </ul>
        <p className="mb-3">{t('staysPrivate')}</p>
        <p className="text-muted">{t('publicNote')}</p>
      </section>

      {problems.length > 0 ? (
        <section
          aria-labelledby="not-ready"
          className="rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
        >
          <h2 id="not-ready" className="mb-2 font-bold">
            {t('notReady')}
          </h2>
          <ul className="mb-3 list-disc pl-6">
            {problems.map((problem) => (
              <li key={problem}>{problem === 'bonded' ? t('needsBonded') : t('needsFee')}</li>
            ))}
          </ul>
          <Link href={`/organisation/listings/${rkey}`}>{t('fixInEditor')}</Link>
        </section>
      ) : (
        <form action={publishListingAction}>
          <input type="hidden" name="$rkey" value={rkey} />
          {!org?.approved && <p className="mb-4">{t('awaitingReview')}</p>}
          <Button type="submit">{t('publish')}</Button>
        </form>
      )}
    </div>
  );
}
