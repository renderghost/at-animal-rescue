import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/Badge';
import { ButtonLink } from '@/components/Button';
import { listAnimals } from '@/server/animals/animals';
import { requireOrganisation } from '@/server/animals/current-org';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Animals');
  return { title: t('title') };
}

export default async function AnimalsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { did, client } = await requireOrganisation();
  const { animals, pdsUnavailable } = await listAnimals(did, client);
  const t = await getTranslations('Animals');
  const taxonomy = await getTranslations('Taxonomy');
  const { deleted } = await searchParams;
  const species = (key: string) =>
    taxonomy.has(`species.${key}` as never) ? taxonomy(`species.${key}` as never) : key;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-6 max-w-prose">{t('intro')}</p>
      {deleted && (
        <p role="status" className="mb-6 rounded-md border border-line bg-sunken p-4">
          {t('deleted')}
        </p>
      )}
      {pdsUnavailable && (
        <p className="mb-6 rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown">
          {t('pdsUnavailable')}
        </p>
      )}
      <ButtonLink href="/organisation/animals/new" className="mb-8">
        {t('add')}
      </ButtonLink>
      {animals.length === 0 ? (
        <p>{t('none')}</p>
      ) : (
        <ul className="grid gap-3">
          {animals.map((animal) => (
            <li
              key={animal.rkey}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4"
            >
              <div>
                <Link
                  href={`/organisation/animals/${animal.rkey}`}
                  className="text-lg font-bold"
                  aria-label={t('edit', { name: animal.name })}
                >
                  {animal.name}
                </Link>
                <p className="text-muted">{species(animal.species)}</p>
              </div>
              {animal.published ? (
                <Badge tone="match">{t('public')}</Badge>
              ) : (
                <Badge>{t('draft')}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
