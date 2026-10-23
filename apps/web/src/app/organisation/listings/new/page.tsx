import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ListingForm } from '@/components/ListingForm';
import { requireOrganisation } from '@/server/animals/current-org';
import { editorOptions } from '@/server/listings/editor-options';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ListingEditor');
  return { title: t('newTitle') };
}

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string }>;
}) {
  const { did, client } = await requireOrganisation();
  const { animals, countries, currencies, defaultCurrency } = await editorOptions(did, client);
  const t = await getTranslations('ListingEditor');
  // "List this animal" from the animal editor starts with that animal chosen.
  const { animal } = await searchParams;
  const preselected = animals.find((a) => a.rkey === animal && !a.takenBy);

  return (
    <div className="max-w-2xl">
      <p className="mb-4">
        <Link href="/organisation/listings">{t('backToList')}</Link>
      </p>
      <h1 className="mb-6 text-3xl font-bold">{t('newTitle')}</h1>
      <ListingForm
        animals={animals}
        countries={countries}
        currencies={currencies}
        defaultCurrency={defaultCurrency}
        initialValues={preselected ? { [`animal.${preselected.rkey}`]: 'on' } : {}}
      />
    </div>
  );
}
