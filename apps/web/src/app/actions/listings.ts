'use server';

import { isValidTid } from '@atproto/syntax';
import { newRecordKey } from '@homeward/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrganisation } from '@/server/animals/current-org';
import {
  deleteListingDraft,
  publishDraftListing,
  saveListing,
  type ListingFormState,
} from '@/server/listings/listings';

function listingKey(form: FormData): string {
  const rkey = form.get('$rkey');
  if (typeof rkey !== 'string' || !isValidTid(rkey)) redirect('/organisation/listings');
  return rkey;
}

/** Saves the listing editor: a new listing starts as a private draft. */
export async function saveListingAction(
  _previous: ListingFormState,
  form: FormData,
): Promise<ListingFormState> {
  const { did, client } = await requireOrganisation();
  const given = form.get('$rkey');
  const isNew = typeof given !== 'string' || !given;
  const rkey = isNew ? newRecordKey() : listingKey(form);
  const result = await saveListing(did, client, rkey, form);
  if (isNew && result.status === 'saved') redirect(`/organisation/listings/${rkey}?created=1`);
  // The preview below the editor shows the saved listing.
  if (result.status === 'saved') revalidatePath(`/organisation/listings/${rkey}`);
  return result;
}

/** Publishes a draft listing from its preview page. */
export async function publishListingAction(form: FormData): Promise<void> {
  const { did, client } = await requireOrganisation();
  const rkey = listingKey(form);
  const result = await publishDraftListing(did, client, rkey);
  if (!result.ok) redirect(`/organisation/listings/${rkey}/publish?error=${result.reason}`);
  redirect(`/organisation/listings/${rkey}?published=1`);
}

export async function deleteListingDraftAction(form: FormData): Promise<void> {
  const { did } = await requireOrganisation();
  await deleteListingDraft(did, listingKey(form));
  redirect('/organisation/listings?deleted=1');
}
