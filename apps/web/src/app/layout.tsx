import type { Metadata } from 'next';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PreferencesForm } from '@/components/PreferencesForm';
import { contentLanguageTag } from '@/i18n/config';
import { getPreferences } from '@/i18n/preferences';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Common');
  return { title: { default: t('appName'), template: `%s · ${t('appName')}` } };
}

const container = 'mx-auto w-full max-w-6xl px-4';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { language } = await getPreferences();
  const t = await getTranslations();

  return (
    <html lang={contentLanguageTag[language]}>
      <body>
        <NextIntlClientProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-10 focus:rounded-sm focus:bg-surface focus:px-4 focus:py-2"
          >
            {t('Common.skipToContent')}
          </a>
          <header className="border-b border-line bg-surface">
            <div className={`${container} flex min-h-16 items-center justify-between gap-4`}>
              <Link href="/" className="text-xl font-bold text-fg no-underline hover:text-fg">
                {t('Common.appName')}
              </Link>
              <nav aria-label={t('Nav.label')}>
                <ul className="flex flex-wrap gap-4">
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
          <main id="main" tabIndex={-1} className={`${container} min-h-[60vh] py-12`}>
            {children}
          </main>
          <footer className="border-t border-line py-8 text-sm text-muted">
            <div className={`${container} grid gap-6`}>
              <PreferencesForm />
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
