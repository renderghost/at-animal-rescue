'use server';

import { redirect } from 'next/navigation';
import { accountData, deletePublicRecords, purgeFromIndex } from '@/server/account/data';
import { endSession, getCurrentUser } from '@/server/auth/session';
import { getCurrentRole, getRepoClient } from '@/server/onboarding/current-role';

/**
 * Deletes everything Homeward holds about the signed-in account (#46), and, if they chose,
 * their public Homeward records from their own account first. Moderation decisions stay.
 */
export async function deleteAccountDataAction(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const role = await getCurrentRole();
  const alsoPublic = role !== undefined && form.get('alsoPublic') === 'on';

  if (alsoPublic) {
    const client = await getRepoClient();
    // Nothing is deleted here until the account's records are gone, so a retry is clean.
    if (!client || !(await deletePublicRecords(client, role))) {
      redirect('/account/data/delete?error=unavailable');
    }
    if (role === 'organisation') await purgeFromIndex(user.did);
  }
  await endSession();
  await accountData().erase(user.did);
  redirect(`/account/deleted${alsoPublic ? '?public=1' : ''}`);
}
