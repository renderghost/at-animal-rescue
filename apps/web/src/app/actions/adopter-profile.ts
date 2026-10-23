'use server';

import { redirect } from 'next/navigation';
import {
  clearAdopterAnswers,
  saveAdopterProfile,
  type AdopterFormState,
} from '@/server/adopter/save-adopter';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole, getRepoClient } from '@/server/onboarding/current-role';

async function currentAdopter() {
  const user = await getCurrentUser();
  const client = await getRepoClient();
  if (!user || !client) redirect('/sign-in');
  if ((await getCurrentRole()) !== 'adopter') redirect('/account');
  return { did: user.did, client };
}

/** Saves the adopter's private answers and their optional public profile. */
export async function updateAdopterProfile(
  _previous: AdopterFormState,
  form: FormData,
): Promise<AdopterFormState> {
  const { did, client } = await currentAdopter();
  return saveAdopterProfile(did, client, form);
}

/** Deletes every private answer and the private location (the public profile is separate). */
export async function clearAdopterProfile(): Promise<void> {
  const { did } = await currentAdopter();
  await clearAdopterAnswers(did);
  redirect(`/adopter/profile?cleared=${Date.now()}`);
}
