import { DEFAULT_SHARE_LINK_DAYS, SHARE_LINK_DAYS } from '@homeward/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EnquiryForm } from '@/components/EnquiryForm';
import { getPreferences } from '@/i18n/preferences';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';
import { contactLinks } from '@/server/org-page/contact';
import { getPrivateStore } from '@/server/private-store';
import { enquiryTarget, MAX_MESSAGE } from '@/server/share/enquiry';
import { siteOrigin } from '@/server/site';

type Props = { params: Promise<{ handle: string; rkey: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Enquire');
  return { title: t('metaTitle'), robots: { index: false } };
}

/**
 * Enquiring as an adopter (#42): the message, and whether to include a link to their
 * answers, with exactly what it shares. Others use the listing's contact links directly.
 */
export default async function EnquirePage({ params }: Props) {
  const { handle, rkey } = await params;
  const { formatLocale: locale } = await getPreferences();
  const target = await enquiryTarget(decodeURIComponent(handle), rkey, locale);
  if (!target) notFound();
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if ((await getCurrentRole()) !== 'adopter') redirect(target.path);

  const location = await getPrivateStore().get(user.did, 'pet.homeward.adopter.location', 'self');
  const t = await getTranslations('Enquire');
  const page = await getTranslations('ListingPage');
  const { org, title } = target;
  const name = org.profile.displayName;
  const url = `${await siteOrigin()}${target.path}`;
  const links = contactLinks(org, { email: '', bluesky: '', website: '' }, { subject: '' });
  const all = [links.preferred, ...links.others];

  return (
    <div className="max-w-2xl">
      <p className="mb-4">
        <Link href={target.path}>{t('back', { title })}</Link>
      </p>
      <h1 className="mb-4 text-3xl font-bold">{t('title', { title })}</h1>
      <p className="mb-6">{t('intro', { name })}</p>
      <EnquiryForm
        org={org.handle ?? org.did}
        rkey={target.view.rkey}
        name={name}
        defaultMessage={page('enquireBody', { title, url }).trim()}
        days={SHARE_LINK_DAYS}
        defaultDays={DEFAULT_SHARE_LINK_DAYS}
        maxMessage={MAX_MESSAGE}
        shared={{
          see: [
            t('seeAnswers'),
            t('seeFit', { title }),
            ...(location?.label ? [t('seePlace', { place: location.label, title })] : []),
            t('seeHandle', { handle: user.handle }),
          ],
          notes: [t('notSeen'), t('live'), t('views'), t('revoke', { name })],
        }}
        contact={{
          preferred: links.preferred.key,
          blueskyHref: all.find((link) => link.key === 'bluesky')!.href,
          websiteHref: all.find((link) => link.key === 'website')?.href,
        }}
      />
    </div>
  );
}
