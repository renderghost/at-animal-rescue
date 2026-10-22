import 'server-only';
import { Client } from '@atproto/lex';
import { pet } from '@homeward/lexicons';
import { cache } from 'react';
import { getCurrentUser, getPdsSession } from '../auth/session';
import { getPrivateStore } from '../private-store';
import type { OrganisationProfile } from './organisation-form';
import { detectRole, type Role } from './role';

/** A client for the signed-in user's repository, or undefined when signed out. */
export async function getRepoClient(): Promise<Client | undefined> {
  const session = await getPdsSession();
  return session && new Client(session);
}

export type ProfileLookup =
  { kind: 'found'; profile: OrganisationProfile } | { kind: 'missing' } | { kind: 'unavailable' };

/** The organisation profile in the signed-in user's own repository. */
export async function loadOrganisationProfile(client: Client): Promise<ProfileLookup> {
  try {
    const { value } = await client.get(pet.homeward.org.profile);
    const { $type: _type, ...profile } = value;
    return { kind: 'found', profile };
  } catch (err) {
    if ((err as { error?: unknown }).error === 'RecordNotFound') return { kind: 'missing' };
    console.warn('Could not load organisation profile from PDS', err);
    return { kind: 'unavailable' };
  }
}

/** The signed-in user's role for this request (undefined if not onboarded yet). */
export const getCurrentRole = cache(async (): Promise<Role | undefined> => {
  const user = await getCurrentUser();
  if (!user) return undefined;
  return detectRole({
    async hasOrganisationProfile() {
      const client = await getRepoClient();
      // PDS unreachable: don't block the page. Publishing will fail visibly if it's still down.
      return client ? (await loadOrganisationProfile(client)).kind === 'found' : false;
    },
    async hasAdopterHousehold() {
      const household = await getPrivateStore().get(
        user.did,
        'pet.homeward.adopter.household',
        'self',
      );
      return household !== undefined;
    },
  });
});
