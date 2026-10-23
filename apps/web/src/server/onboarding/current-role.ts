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

/** A record from the signed-in user's own repository, or why there isn't one. */
export type RecordLookup<T> =
  { kind: 'found'; record: T } | { kind: 'missing' } | { kind: 'unavailable' };

/** Reads one of the user's own records, telling "not there" apart from "PDS unreachable". */
export async function lookupRecord<T extends { $type: string }>(
  get: () => Promise<{ value: T }>,
): Promise<RecordLookup<Omit<T, '$type'>>> {
  try {
    const { $type: _type, ...record } = (await get()).value;
    return { kind: 'found', record };
  } catch (err) {
    if ((err as { error?: unknown }).error === 'RecordNotFound') return { kind: 'missing' };
    console.warn('Could not read a record from the PDS', err);
    return { kind: 'unavailable' };
  }
}

/** The organisation profile in the signed-in user's own repository. */
export function loadOrganisationProfile(
  client: Client,
): Promise<RecordLookup<OrganisationProfile>> {
  return lookupRecord(() => client.get(pet.homeward.org.profile));
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
