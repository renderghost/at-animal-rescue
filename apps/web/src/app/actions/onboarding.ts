'use server';

import { toDatetimeString } from '@atproto/syntax';
import { pet } from '@homeward/lexicons';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole, getRepoClient } from '@/server/onboarding/current-role';
import {
  parseOrganisationForm,
  type FieldError,
  type OrganisationField,
  type OrganisationFormValues,
} from '@/server/onboarding/organisation-form';
import { getPrivateStore } from '@/server/private-store';

export type OrganisationFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      errors: Partial<Record<OrganisationField, FieldError>>;
      values: OrganisationFormValues;
      publishFailed?: boolean;
    };

/** Publishes the organisation profile to the user's own repository. */
export async function createOrganisation(
  _previous: OrganisationFormState,
  form: FormData,
): Promise<OrganisationFormState> {
  if (!(await getCurrentUser())) redirect('/sign-in');
  if (await getCurrentRole()) redirect('/welcome/done');

  const parsed = parseOrganisationForm(form);
  if (!parsed.ok) return { status: 'error', errors: parsed.errors, values: parsed.values };

  const client = await getRepoClient();
  if (!client) redirect('/sign-in');
  try {
    await client.put(pet.homeward.org.profile, parsed.record);
  } catch {
    return {
      status: 'error',
      errors: {},
      values: Object.fromEntries(form.entries()) as unknown as OrganisationFormValues,
      publishFailed: true,
    };
  }
  redirect('/welcome/done');
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
