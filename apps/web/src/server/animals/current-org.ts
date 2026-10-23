import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../auth/session';
import { getCurrentRole, getRepoClient } from '../onboarding/current-role';

/** The signed-in organisation for its own pages; anyone else is sent where they belong. */
export async function requireOrganisation() {
  const user = await getCurrentUser();
  const client = await getRepoClient();
  if (!user || !client) redirect('/sign-in');
  if ((await getCurrentRole()) !== 'organisation') redirect('/account');
  return { did: user.did, client };
}
