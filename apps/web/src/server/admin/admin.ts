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
 * Emails an organisation, only when its contact address is confirmed (#30); its dashboard
 * always shows the same. Best effort: a mail failure never undoes a decision.
 */
export async function mailOrg(
  did: string,
  write: (org: { name: string; dashboard: string }) => Promise<{ subject: string; text: string }>,
): Promise<void> {
  try {
    const org = await getPublicOrg({ did });
    const email = org?.profile.contact.email;
    if (!org || !confirmationHolds(await emailConfirmationOf(did), email)) return;
    const dashboard = `${await siteOrigin()}/organisation`;
    await sendMail({ to: email!, ...(await write({ name: org.profile.displayName, dashboard })) });
  } catch (err) {
    console.warn('Could not email the organisation', err);
  }
}

/** Tells an organisation about a decision on its review (#43). */
export async function notifyOrg(
  did: string,
  decision: 'approved' | 'rejected' | 'revoked',
  reason?: string,
): Promise<void> {
  const t = await getTranslations('ReviewEmail');
  await mailOrg(did, async ({ name, dashboard }) => ({
    subject: t(`${decision}.subject`, { name }),
    text: t(`${decision}.body`, { name, reason: reason ?? '', dashboard }),
  }));
}
