import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const SECTIONS = [
  'controller',
  'collected',
  'why',
  'kept',
  'cookies',
  'analytics',
  'sharing',
  'rights',
  'contact',
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Privacy');
  return { title: t('metaTitle') };
}

/** The privacy notice (#46): headings only until the legal entity exists. */
export default async function PrivacyPage() {
  const t = await getTranslations('Privacy');
  return (
    <div className="max-w-prose">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-8 rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown">
        {t('draft')}
      </p>
      {SECTIONS.map((key) => (
        <section key={key} aria-labelledby={`privacy-${key}`} className="mb-6">
          <h2 id={`privacy-${key}`} className="mb-2 text-xl font-bold">
            {t(`sections.${key}`)}
          </h2>
          <p className="text-muted">{t('todo')}</p>
          {key === 'rights' && (
            <p className="mt-2">
              {t.rich('yourData', {
                link: (chunks) => <Link href="/account/data">{chunks}</Link>,
              })}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
