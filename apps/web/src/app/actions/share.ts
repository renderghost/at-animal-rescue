'use server';

import { redirect } from 'next/navigation';
import { getPreferences } from '@/i18n/preferences';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';
import { shareLinks } from '@/server/share/enquiry';
import { shareContent, type ShareContent } from '@/server/share/view';

export type ShareState =
  { status: 'idle' } | { status: 'gone' } | { status: 'shown'; content: ShareContent };

/**
 * Shows an adopter's answers to whoever holds their link (#42), and logs that it was opened.
 * A deliberate press, so link scanners and previews (which only fetch the page) see nothing
 * and aren't counted.
 */
export async function revealShare(_previous: ShareState, form: FormData): Promise<ShareState> {
  const store = shareLinks();
  const link = await store.find(String(form.get('token') ?? ''));
  if (!link || link.state !== 'active') return { status: 'gone' };
  const { formatLocale: locale, distanceUnit: unit } = await getPreferences();
  const content = await shareContent(link, { locale, unit });
  await store.recordView(link.id);
  return { status: 'shown', content };
}

/** Withdraws one of the signed-in adopter's links. */
export async function revokeShareAction(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if ((await getCurrentRole()) === 'organisation') redirect('/organisation');
  await shareLinks().revoke(user.did, String(form.get('id') ?? ''));
  redirect('/adopter/shares?withdrawn=1');
}
