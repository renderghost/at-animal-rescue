import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/Button';
import { ExternalLink } from '@/components/ExternalLink';
import { LINKS } from '@/config/links';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('GetStarted');
  return { title: t('title') };
}

const step = 'rounded-lg border border-line bg-surface p-6';

export default async function GetStartedPage() {
  const t = await getTranslations('GetStarted');

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-lg">{t('intro')}</p>

      <aside className="mb-8 rounded-md border border-line bg-sunken p-4">
        <h2 className="font-semibold">{t('haveAccountHeading')}</h2>
        <p>{t('haveAccountBody')}</p>
      </aside>

      <ol className="grid gap-6">
        <li className={step}>
          <h2 className="mb-2 text-xl font-bold">{t('step1Heading')}</h2>
          <p className="mb-4">{t('step1Body')}</p>
          <ExternalLink href={LINKS.euroskySignUp}>{t('step1Action')}</ExternalLink>
        </li>
        <li className={step}>
          <h2 className="mb-2 text-xl font-bold">{t('step2Heading')}</h2>
          <p className="mb-4">{t('step2Body', { provider: LINKS.euroskyHostingProvider })}</p>
          <ExternalLink href={LINKS.appPasswords}>{t('step2Action')}</ExternalLink>
        </li>
        <li className={step}>
          <h2 className="mb-2 text-xl font-bold">{t('step3Heading')}</h2>
          <p className="mb-4">{t('step3Body')}</p>
          <ButtonLink href="/sign-in">{t('step3Action')}</ButtonLink>
        </li>
      </ol>

      <section className="mt-10" aria-labelledby="why-app-password">
        <h2 id="why-app-password" className="mb-2 text-xl font-bold">
          {t('whyHeading')}
        </h2>
        <p>{t('whyBody')}</p>
      </section>
    </div>
  );
}
