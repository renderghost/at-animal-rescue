import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { deleteAnimalDraft } from '@/app/actions/animals';
import { AnimalForm } from '@/components/AnimalForm';
import { AnimalMedia } from '@/components/AnimalMedia';
import { Button } from '@/components/Button';
import { animalToFormValues } from '@/server/animals/animal-form';
import { isAnimalKey, loadAnimal, photoCid } from '@/server/animals/animals';
import { requireOrganisation } from '@/server/animals/current-org';

type Props = {
  params: Promise<{ rkey: string }>;
  searchParams: Promise<{ created?: string }>;
};

async function load(rkey: string) {
  if (!isAnimalKey(rkey)) notFound();
  const { did, client } = await requireOrganisation();
  return loadAnimal(did, client, rkey);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const animal = await load((await params).rkey);
  const t = await getTranslations('AnimalEditor');
  return {
    title: animal.kind === 'found' ? t('editTitle', { name: animal.record.name }) : undefined,
  };
}

export default async function EditAnimalPage({ params, searchParams }: Props) {
  const { rkey } = await params;
  const animal = await load(rkey);
  if (animal.kind === 'missing') notFound();
  const t = await getTranslations('AnimalEditor');
  const { created } = await searchParams;

  return (
    <div className="max-w-2xl">
      <p className="mb-4">
        <Link href="/organisation/animals">{t('backToList')}</Link>
      </p>
      {animal.kind === 'unavailable' ? (
        <p
          role="alert"
          className="rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
        >
          {t('publishFailed')}
        </p>
      ) : (
        <>
          <h1 className="mb-6 text-3xl font-bold">
            {t('editTitle', { name: animal.record.name })}
          </h1>
          <AnimalForm
            rkey={rkey}
            initialValues={animalToFormValues(animal.record, animal.identification)}
            published={animal.published}
            justCreated={Boolean(created)}
          />
          <AnimalMedia
            rkey={rkey}
            published={animal.published}
            photos={(animal.record.photos ?? []).map((photo) => ({
              cid: photoCid(photo),
              alt: photo.alt,
              width: photo.aspectRatio?.width,
              height: photo.aspectRatio?.height,
            }))}
            videos={animal.record.videos ?? []}
          />
          {!animal.published && (
            // Two deliberate steps, without JavaScript: open the panel, then confirm.
            <details className="mt-12 border-t border-line pt-6">
              <summary className="cursor-pointer text-xl font-bold">{t('deleteHeading')}</summary>
              <p className="mt-4 mb-4 text-muted">{t('deleteBody')}</p>
              <form action={deleteAnimalDraft}>
                <input type="hidden" name="$rkey" value={rkey} />
                <Button type="submit" variant="secondary">
                  {t('deleteAction')}
                </Button>
              </form>
            </details>
          )}
        </>
      )}
    </div>
  );
}
