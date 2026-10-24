'use server';

import { isValidDid } from '@atproto/syntax';
import { redirect } from 'next/navigation';
import { MAX_REASON, notifyOrg, orgReviews, requireAdmin } from '@/server/admin/admin';
import { requireOrganisation } from '@/server/animals/current-org';

function target(form: FormData): string {
  const did = String(form.get('did') ?? '');
  if (!isValidDid(did)) redirect('/admin');
  return did;
}

function reasonOf(form: FormData, did: string, action: string): string {
  const reason = String(form.get('reason') ?? '').trim();
  if (!reason || reason.length > MAX_REASON) {
    redirect(
      `/admin?error=${reason ? 'reasonTooLong' : 'reasonRequired'}&action=${action}&did=${encodeURIComponent(did)}#org-${encodeURIComponent(did)}`,
    );
  }
  return reason;
}

/** Approves an organisation: everything it publishes becomes public (#43). */
export async function approveOrgAction(form: FormData): Promise<void> {
  const moderator = await requireAdmin();
  const did = target(form);
  await orgReviews().approve(did, moderator);
  await notifyOrg(did, 'approved');
  redirect('/admin?done=approved');
}

/** Not approved yet, with a reason the organisation sees. */
export async function rejectOrgAction(form: FormData): Promise<void> {
  const moderator = await requireAdmin();
  const did = target(form);
  const reason = reasonOf(form, did, 'reject');
  await orgReviews().reject(did, moderator, reason);
  await notifyOrg(did, 'rejected', reason);
  redirect('/admin?done=rejected');
}

/** Withdraws approval: all its listings leave discovery at once. */
export async function revokeOrgAction(form: FormData): Promise<void> {
  const moderator = await requireAdmin();
  const did = target(form);
  const reason = reasonOf(form, did, 'revoke');
  await orgReviews().revoke(did, moderator, reason);
  await notifyOrg(did, 'revoked', reason);
  redirect('/admin?done=revoked');
}

/** The organisation asks to be looked at again after fixing what the reason said. */
export async function requestReviewAction(): Promise<void> {
  const { did } = await requireOrganisation();
  await orgReviews().requestReview(did);
  redirect('/organisation?reviewRequested=1');
}
