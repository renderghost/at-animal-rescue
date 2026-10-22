import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/Badge';
import { ButtonLink } from '@/components/Button';

const card = 'rounded-lg border border-line bg-surface p-6';

export default async function HomePage() {
  const t = await getTranslations();

  return (
    <>
      <section className="mb-12 max-w-2xl" aria-labelledby="home-title">
        <h1 id="home-title" className="mb-4 text-display font-bold">
          {t('Home.title')}
        </h1>
        <p className="text-xl text-muted">{t('Home.lead')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/discover">{t('Home.ctaDiscover')}</ButtonLink>
          <ButtonLink href="/get-started" variant="secondary">
            {t('Home.ctaOrgs')}
          </ButtonLink>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className={card} aria-labelledby="adopters">
          <h2 id="adopters" className="mb-4 text-2xl font-bold">
            {t('Home.adopterHeading')}
          </h2>
          <p>{t('Home.adopterBody')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="match">{t('Match.match')}</Badge>
            <Badge tone="conflict">{t('Match.conflict')}</Badge>
            <Badge tone="unknown">{t('Match.unknown')}</Badge>
          </div>
        </section>
        <section className={card} aria-labelledby="orgs">
          <h2 id="orgs" className="mb-4 text-2xl font-bold">
            {t('Home.orgHeading')}
          </h2>
          <p>{t('Home.orgBody')}</p>
        </section>
      </div>
    </>
  );
}
