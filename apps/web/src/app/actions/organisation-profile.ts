'use server';

import { redirect } from 'next/navigation';
import { getRepoClient, loadOrganisationProfile } from '@/server/onboarding/current-role';
import { parseOrganisationForm } from '@/server/onboarding/organisation-form';
import {
  saveOrganisationProfile,
  type OrganisationFormState,
} from '@/server/onboarding/save-profile';

/** Saves the organisation's edited profile back to its own repository. */
export async function updateOrganisationProfile(
  _previous: OrganisationFormState,
  form: FormData,
): Promise<OrganisationFormState> {
  const client = await getRepoClient();
  if (!client) redirect('/sign-in');
  // Read it again rather than trusting the page: it keeps the creation time and any fields
  // the form doesn't edit, as they are now.
  const existing = await loadOrganisationProfile(client);
  if (existing.kind === 'missing') redirect('/welcome');
  if (existing.kind === 'unavailable') {
    const { values } = parseOrganisationForm(form);
    return { status: 'error', errors: {}, values, publishFailed: true };
  }

  return saveOrganisationProfile(client, form, existing.record);
}
