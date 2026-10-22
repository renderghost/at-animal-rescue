import 'server-only';
import { Client } from '@atproto/lex';
import { pet } from '@homeward/lexicons';
import { cache } from 'react';
import { getCurrentUser, getPdsSession } from '../auth/session';
import { getPrivateStore } from '../private-store';
import { detectRole, type Role } from './role';

/** A client for the signed-in user's repository, or undefined when signed out. */
export async function getRepoClient(): Promise<Client | undefined> {
  const session = await getPdsSession();
  return session && new Client(session);
}

/** The signed-in user's role for this request (undefined if not onboarded yet). */
export const getCurrentRole = cache(async (): Promise<Role | undefined> => {
  const user = await getCurrentUser();
  if (!user) return undefined;
  return detectRole({
    async hasOrganisationProfile() {
      const client = await getRepoClient();
      if (!client) return false;
      try {
        await client.get(pet.homeward.org.profile);
        return true;
      } catch (err) {
        if ((err as { error?: unknown }).error === 'RecordNotFound') return false;
        // PDS unreachable: don't block the page. Publishing will fail visibly if it's still down.
        console.warn('Could not check organisation profile on PDS', err);
        return false;
      }
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
