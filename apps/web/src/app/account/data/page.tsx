import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DownloadLink } from '@/components/Button';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';
import { heldItems } from './held';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AccountData');
  return { title: t('title'), robots: { index: false } };
}

/** What Homeward holds about the signed-in account, to download or delete (#46). */
export default async function AccountDataPage() {
  if (!(await getCurrentUser())) redirect('/sign-in');
  const role = await getCurrentRole();
  const t = await getTranslations('AccountData');

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-6">{t('intro')}</p>

      <section aria-labelledby="held" className="mb-8">
        <h2 id="held" className="mb-3 text-xl font-bold">
          {t('heldHeading')}
        </h2>
        <ul className="mb-3 grid list-disc gap-1 pl-6">
          {(await heldItems(role, true)).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {role && <p className="text-muted">{t(`publicNote.${role}`)}</p>}
      </section>

      <section aria-labelledby="download" className="mb-8">
        <h2 id="download" className="mb-3 text-xl font-bold">
          {t('downloadHeading')}
        </h2>
        <p className="mb-4">{t('downloadBody')}</p>
        {/* A plain link: the browser saves the file, with or without JavaScript. */}
        <DownloadLink href="/account/data/export" variant="secondary">
          {t('download')}
        </DownloadLink>
      </section>

      <section aria-labelledby="delete" className="mb-8">
        <h2 id="delete" className="mb-3 text-xl font-bold">
          {t('deleteHeading')}
        </h2>
        <p className="mb-4">{t('deleteBody')}</p>
        <Link href="/account/data/delete">{t('deleteLink')}</Link>
      </section>
    </div>
  );
}
