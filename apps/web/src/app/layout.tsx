import type { Metadata } from 'next';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import './globals.css';
import styles from './layout.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Common');
  return { title: { default: t('appName'), template: `%s · ${t('appName')}` } };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <a className={styles.skipLink} href="#main">
            {t('Common.skipToContent')}
          </a>
          <header className={styles.header}>
            <div className={`container ${styles.headerInner}`}>
              <Link href="/" className={styles.brand}>
                {t('Common.appName')}
              </Link>
              <nav className={styles.nav} aria-label={t('Nav.label')}>
                <ul>
                  <li>
                    <Link href="/discover">{t('Nav.discover')}</Link>
                  </li>
                  <li>
                    <Link href="/sign-in">{t('Nav.signIn')}</Link>
                  </li>
                </ul>
              </nav>
            </div>
          </header>
          <main id="main" tabIndex={-1} className={`container ${styles.main}`}>
            {children}
          </main>
          <footer className={styles.footer}>
            <div className="container">
              <p>
                {t('Footer.tagline')} {t('Footer.hostedInEu')}
              </p>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
