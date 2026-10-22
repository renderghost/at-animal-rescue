'use server';

import { toDatetimeString } from '@atproto/syntax';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole, getRepoClient } from '@/server/onboarding/current-role';
import {
  saveOrganisationProfile,
  type OrganisationFormState,
} from '@/server/onboarding/save-profile';
import { getPrivateStore } from '@/server/private-store';

/** Publishes the organisation profile to the user's own repository. */
export async function createOrganisation(
  _previous: OrganisationFormState,
  form: FormData,
): Promise<OrganisationFormState> {
  if (!(await getCurrentUser())) redirect('/sign-in');
  if (await getCurrentRole()) redirect('/welcome/done');

  const client = await getRepoClient();
  if (!client) redirect('/sign-in');
  const result = await saveOrganisationProfile(client, form);
  if (result.status !== 'saved') return result;
  redirect(result.unlocated ? `/welcome/done?unlocated=${result.unlocated}` : '/welcome/done');
}

/**
 * Starts an adopter account: an (empty) private household record marks the role.
 * Nothing is published; household details are added later and stay private.
 */
export async function becomeAdopter(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if (!(await getCurrentRole())) {
    await getPrivateStore().put(user.did, 'pet.homeward.adopter.household', 'self', {
      $type: 'pet.homeward.adopter.household',
      updatedAt: toDatetimeString(new Date()),
    });
  }
  redirect('/welcome/done');
}
