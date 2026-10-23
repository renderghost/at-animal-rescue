'use server';

import { isValidTid } from '@atproto/syntax';
import { redirect } from 'next/navigation';
import { getPreferences } from '@/i18n/preferences';
import { discoverQuery, filtersFromQuery } from '@/lib/discover-filters';
import { deleteSearch, renameSearch, saveSearch } from '@/server/adopter/saved-searches';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';

/** Anyone signed in who isn't an organisation can manage searches they saved earlier. */
async function currentSearcher() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if ((await getCurrentRole()) === 'organisation') redirect('/organisation');
  return user.did;
}

/** Saves Discover's current filters (#41). Only adopters save. */
export async function saveSearchAction(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const filters = filtersFromQuery(String(form.get('query') ?? ''));
  const query = discoverQuery(filters);
  if ((await getCurrentRole()) !== 'adopter') redirect(`/discover${query}`);
  const { distanceUnit } = await getPreferences();
  const name = String(form.get('name') ?? '').trim();
  const result = await saveSearch(user.did, filters, name, distanceUnit);
  const status = result === 'saved' ? 'saved=1' : `saveError=${result}`;
  redirect(`/discover${query}${query ? '&' : '?'}${status}#save-search`);
}

export async function renameSearchAction(form: FormData): Promise<void> {
  const did = await currentSearcher();
  const rkey = String(form.get('rkey') ?? '');
  if (!isValidTid(rkey)) redirect('/adopter/searches');
  const result = await renameSearch(did, rkey, String(form.get('name') ?? '').trim());
  redirect(
    result === 'renamed'
      ? '/adopter/searches?renamed=1'
      : result === 'missing'
        ? '/adopter/searches'
        : `/adopter/searches?error=${result}&rkey=${rkey}#search-${rkey}`,
  );
}

export async function deleteSearchAction(form: FormData): Promise<void> {
  const did = await currentSearcher();
  const rkey = String(form.get('rkey') ?? '');
  if (isValidTid(rkey)) await deleteSearch(did, rkey);
  redirect('/adopter/searches?deleted=1');
}
