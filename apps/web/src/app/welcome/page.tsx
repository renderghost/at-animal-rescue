import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { becomeAdopter } from '@/app/actions/onboarding';
import { Button, ButtonLink } from '@/components/Button';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Welcome');
  return { title: t('title') };
}

const card = 'flex flex-col gap-4 rounded-lg border border-line bg-surface p-6';

export default async function WelcomePage() {
  if (!(await getCurrentUser())) redirect('/sign-in');
  // Already onboarded: nothing to choose.
  if (await getCurrentRole()) redirect('/');
  const t = await getTranslations('Welcome');

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-8 max-w-prose">{t('intro')}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <section className={card} aria-labelledby="role-org">
          <h2 id="role-org" className="text-xl font-bold">
            {t('orgHeading')}
          </h2>
          <p className="grow">{t('orgBody')}</p>
          <ButtonLink href="/welcome/organisation" className="self-start">
            {t('orgAction')}
          </ButtonLink>
        </section>
        <section className={card} aria-labelledby="role-adopter">
          <h2 id="role-adopter" className="text-xl font-bold">
            {t('adopterHeading')}
          </h2>
          <p className="grow">{t('adopterBody')}</p>
          <form action={becomeAdopter}>
            <Button type="submit">{t('adopterAction')}</Button>
          </form>
        </section>
      </div>
    </div>
  );
}
