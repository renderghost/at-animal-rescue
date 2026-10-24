import 'server-only';
import { confirmationHolds, OrgReviewStore } from '@homeward/db';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '../auth/session';
import { getDb } from '../db';
import { sendMail } from '../mail';
import { emailConfirmationOf, getPublicOrg } from '../org-page/org';
import { siteOrigin } from '../site';
import { isAdmin } from './admins';

export { isAdmin } from './admins';

/** The signed-in moderator; anyone else gets "not found", so the console isn't advertised. */
export async function requireAdmin(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.did)) notFound();
  return user.did;
}

export function orgReviews() {
  return new OrgReviewStore(getDb());
}

export const MAX_REASON = 1000;

/**
 * Tells an organisation about a decision by email, only when its contact address is
 * confirmed (#30); its dashboard always shows it. Best effort: a mail failure never undoes
 * the decision.
 */
export async function notifyOrg(
  did: string,
  decision: 'approved' | 'rejected' | 'revoked',
  reason?: string,
): Promise<void> {
  try {
    const org = await getPublicOrg({ did });
    const email = org?.profile.contact.email;
    if (!org || !confirmationHolds(await emailConfirmationOf(did), email)) return;
    const t = await getTranslations('ReviewEmail');
    const dashboard = `${await siteOrigin()}/organisation`;
    const name = org.profile.displayName;
    await sendMail({
      to: email!,
      subject: t(`${decision}.subject`, { name }),
      text: t(`${decision}.body`, { name, reason: reason ?? '', dashboard }),
    });
  } catch (err) {
    console.warn('Could not email the organisation about its review', err);
  }
}
