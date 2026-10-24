import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ShareReveal } from '@/components/ShareReveal';
import { getPreferences } from '@/i18n/preferences';
import { shareLinks } from '@/server/share/enquiry';
import { sharedListing } from '@/server/share/view';

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Share');
  // Never indexed, and the secret in the address isn't passed on to other sites. Not
  // no-referrer: browsers then send a null origin with a plain form post, which Next.js's
  // protection against cross-site posts rightly refuses, so "Show answers" would need
  // JavaScript.
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'same-origin',
  };
}

/**
 * Where a share link leads (#42). Says whose answers and what for, but shows them only
 * after "Show answers", so link scanners and previews never see them.
 */
export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const link = await shareLinks().find(token);
  if (!link) notFound();
  const t = await getTranslations('Share');
  const { formatLocale: locale } = await getPreferences();
  const { org, title } = await sharedListing(link, locale);
  const name = org?.profile.displayName ?? t('unknownOrg');
  const dateOf = (date: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold">{t('heading', { name })}</h1>
      {link.state === 'active' ? (
        <>
          <p className="mb-2 max-w-prose">
            {t('intro', { name, title: title ?? t('unknownListing') })}
          </p>
          <p className="mb-6 max-w-prose text-sm text-muted">{t('logged')}</p>
          <ShareReveal token={token} />
        </>
      ) : (
        <p role="status" className="max-w-prose">
          {t('gone')}{' '}
          {link.state === 'expired' ? t('expired', { date: dateOf(link.expiresAt) }) : t('revoked')}
        </p>
      )}
    </div>
  );
}
