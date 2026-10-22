import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/Badge';
import { ButtonLink } from '@/components/Button';
import styles from './page.module.css';

export default async function HomePage() {
  const t = await getTranslations();

  return (
    <>
      <section className={styles.hero} aria-labelledby="home-title">
        <h1 id="home-title" className={styles.title}>
          {t('Home.title')}
        </h1>
        <p className={styles.lead}>{t('Home.lead')}</p>
        <div className={styles.actions}>
          <ButtonLink href="/discover">{t('Home.ctaDiscover')}</ButtonLink>
          <ButtonLink href="/sign-in" variant="secondary">
            {t('Home.ctaOrgs')}
          </ButtonLink>
        </div>
      </section>

      <div className={styles.cards}>
        <section className={styles.card} aria-labelledby="adopters">
          <h2 id="adopters">{t('Home.adopterHeading')}</h2>
          <p>{t('Home.adopterBody')}</p>
          <div className={styles.badges}>
            <Badge tone="match">{t('Match.match')}</Badge>
            <Badge tone="conflict">{t('Match.conflict')}</Badge>
            <Badge tone="unknown">{t('Match.unknown')}</Badge>
          </div>
        </section>
        <section className={styles.card} aria-labelledby="orgs">
          <h2 id="orgs">{t('Home.orgHeading')}</h2>
          <p>{t('Home.orgBody')}</p>
        </section>
      </div>
    </>
  );
}
