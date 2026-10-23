import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { AnimalForm } from '@/components/AnimalForm';
import { requireOrganisation } from '@/server/animals/current-org';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AnimalEditor');
  return { title: t('newTitle') };
}

export default async function NewAnimalPage() {
  await requireOrganisation();
  const t = await getTranslations('AnimalEditor');
  const media = await getTranslations('AnimalMedia');
  return (
    <div className="max-w-2xl">
      <p className="mb-4">
        <Link href="/organisation/animals">{t('backToList')}</Link>
      </p>
      <h1 className="mb-6 text-3xl font-bold">{t('newTitle')}</h1>
      <AnimalForm />
      <p className="mt-10 border-t border-line pt-6 text-muted">{media('saveFirst')}</p>
    </div>
  );
}
