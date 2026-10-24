'use server';

import { DEFAULT_SHARE_LINK_DAYS } from '@homeward/db';
import { getTranslations } from 'next-intl/server';
import { getPreferences } from '@/i18n/preferences';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';
import { contactLinks } from '@/server/org-page/contact';
import { enquiryTarget, MAX_MESSAGE, shareLinks } from '@/server/share/enquiry';
import { siteOrigin } from '@/server/site';

export type EnquiryState =
  | { status: 'idle' }
  | {
      status: 'error';
      problem: 'messageRequired' | 'messageTooLong' | 'unavailable';
      message: string;
      include: boolean;
      days: number;
    }
  | {
      status: 'ready';
      /** The whole message, with the link if they included one. */
      message: string;
      /** Opens their email app with it, when the organisation has an email address. */
      mailto?: string;
      /** When the link stops working, already formatted. */
      until?: string;
    };

/**
 * Prepares an adopter's enquiry (#42): their message and, if they chose, a new link to
 * their answers. The link's secret is in this response only; nothing of the message is
 * stored.
 */
export async function prepareEnquiry(
  _previous: EnquiryState,
  form: FormData,
): Promise<EnquiryState> {
  const user = await getCurrentUser();
  const message = String(form.get('message') ?? '').trim();
  const include = form.get('include') === 'on';
  const days = Number(form.get('days')) || DEFAULT_SHARE_LINK_DAYS;
  const kept = { message, include, days };
  const { formatLocale: locale } = await getPreferences();
  const target = await enquiryTarget(
    String(form.get('org') ?? ''),
    String(form.get('rkey') ?? ''),
    locale,
  );
  if (!user || (await getCurrentRole()) !== 'adopter' || !target) {
    return { status: 'error', problem: 'unavailable', ...kept };
  }
  if (!message) return { status: 'error', problem: 'messageRequired', ...kept };
  if (message.length > MAX_MESSAGE) return { status: 'error', problem: 'messageTooLong', ...kept };

  const t = await getTranslations('Enquire');
  const page = await getTranslations('ListingPage');
  let body = message;
  let until: string | undefined;
  if (include) {
    const link = await shareLinks().create({
      adopterDid: user.did,
      adopterHandle: user.handle,
      orgDid: target.org.did,
      listingUri: `at://${target.org.did}/pet.homeward.listing/${target.view.rkey}`,
      days,
    });
    until = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(link.expiresAt);
    const url = `${await siteOrigin()}/share/${link.token}`;
    body = `${message}\n\n${t('linkLine', { title: target.title, date: until })}\n${url}`;
  }
  const { preferred, others } = contactLinks(
    target.org,
    { email: '', bluesky: '', website: '' },
    { subject: page('enquireSubject', { title: target.title }), body },
  );
  const mailto = [preferred, ...others].find((link) => link.key === 'email')?.href;
  return { status: 'ready', message: body, ...(mailto && { mailto }), ...(until && { until }) };
}
