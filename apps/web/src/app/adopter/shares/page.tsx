import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { revokeShareAction } from '@/app/actions/share';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { getPreferences } from '@/i18n/preferences';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';
import { shareLinks } from '@/server/share/enquiry';
import { sharedListing } from '@/server/share/view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SharedLinks');
  return { title: t('title') };
}

const hidden = (chunks: ReactNode) => <span className="sr-only">{chunks}</span>;

/**
 * The links to their answers an adopter has sent (#42): who to, when each was opened, and
 * a way to withdraw it. Anyone signed in who isn't an organisation can see theirs, so none
 * are stranded if they clear their answers.
 */
export default async function SharedLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ withdrawn?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if ((await getCurrentRole()) === 'organisation') redirect('/organisation');
  const t = await getTranslations('SharedLinks');
  const { formatLocale: locale } = await getPreferences();
  const { withdrawn } = await searchParams;
  const links = await Promise.all(
    (await shareLinks().listForAdopter(user.did)).map(async (link) => ({
      link,
      shared: await sharedListing(link, locale),
    })),
  );
  const dateOf = (date: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-3xl font-bold">{t('title')}</h1>
      <p className="mb-6">{t('intro')}</p>
      {withdrawn && (
        <p role="status" className="mb-6 rounded-md border border-line bg-sunken p-4">
          {t('withdrawn')}
        </p>
      )}
      {links.length === 0 ? (
        <p>{t('none')}</p>
      ) : (
        <ul className="grid gap-4">
          {links.map(({ link, shared }) => {
            const name = shared.org?.profile.displayName ?? t('unknownOrg');
            const title = shared.title ?? t('unknownListing');
            return (
              <li key={link.id} className="rounded-lg border border-line bg-surface p-5">
                <h2 className="mb-1 text-lg font-bold">
                  {shared.path ? (
                    <Link href={shared.path}>{t('about', { name, title })}</Link>
                  ) : (
                    t('about', { name, title })
                  )}
                </h2>
                <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {/* Words as well as tone, never colour alone. */}
                  <Badge tone={link.state === 'active' ? 'match' : 'neutral'}>
                    {link.state === 'active'
                      ? t('active', { date: dateOf(link.expiresAt) })
                      : link.state === 'expired'
                        ? t('expired', { date: dateOf(link.expiresAt) })
                        : t('revoked', { date: dateOf(link.revokedAt!) })}
                  </Badge>
                  <span className="text-sm text-muted">
                    {t('sent', { date: dateOf(link.createdAt) })}
                  </span>
                </p>
                <p className="mb-3">
                  {t('views', {
                    count: link.views,
                    last: link.lastViewedAt
                      ? new Intl.DateTimeFormat(locale, {
                          dateStyle: 'long',
                          timeStyle: 'short',
                        }).format(link.lastViewedAt)
                      : '',
                  })}
                </p>
                {link.state === 'active' && (
                  // Two deliberate steps, without JavaScript, as elsewhere.
                  <details>
                    <summary className="cursor-pointer text-accent underline underline-offset-[0.15em]">
                      {t.rich('withdraw', { name, hidden })}
                    </summary>
                    <form action={revokeShareAction} className="mt-3">
                      <input type="hidden" name="id" value={link.id} />
                      <p className="mb-3">{t('withdrawConfirm', { name })}</p>
                      <Button type="submit" variant="secondary">
                        {t('withdrawAction')}
                      </Button>
                    </form>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
