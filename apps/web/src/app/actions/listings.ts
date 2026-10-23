'use server';

import { isValidTid } from '@atproto/syntax';
import { newRecordKey } from '@homeward/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOrganisation } from '@/server/animals/current-org';
import { crossPostListing } from '@/server/listings/cross-post';
import {
  changeListingStatus,
  deleteListingDraft,
  deleteWithdrawnListing,
  publishDraftListing,
  saveListing,
  type ListingFormState,
} from '@/server/listings/listings';
import { checkPostText } from '@/server/listings/post-text';

function listingKey(form: FormData): string {
  const rkey = form.get('$rkey');
  if (typeof rkey !== 'string' || !isValidTid(rkey)) redirect('/organisation');
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

/** Publishes a draft listing from its preview page, and posts it on Bluesky if asked (#36). */
export async function publishListingAction(form: FormData): Promise<void> {
  const { did, client } = await requireOrganisation();
  const rkey = listingKey(form);
  const post = form.get('crossPost') === 'on' ? String(form.get('postText') ?? '') : undefined;
  // A post that can't go out stops the publish, so nothing happens by halves.
  const problem = post !== undefined && checkPostText(post);
  if (problem) redirect(`/organisation/listings/${rkey}/publish?error=post-${problem}`);
  const result = await publishDraftListing(did, client, rkey);
  if (!result.ok) redirect(`/organisation/listings/${rkey}/publish?error=${result.reason}`);
  if (post === undefined) redirect(`/organisation/listings/${rkey}?published=1`);
  const posted = await crossPostListing(did, client, rkey, post);
  redirect(
    posted.ok
      ? `/organisation/listings/${rkey}?published=1&posted=1`
      : `/organisation/listings/${rkey}?published=1&postError=${posted.reason}`,
  );
}

/** Posts a published listing on Bluesky from its editor (#36). */
export async function crossPostAction(form: FormData): Promise<void> {
  const { did, client } = await requireOrganisation();
  const rkey = listingKey(form);
  const result = await crossPostListing(did, client, rkey, String(form.get('postText') ?? ''));
  redirect(
    result.ok
      ? `/organisation/listings/${rkey}?posted=1`
      : `/organisation/listings/${rkey}?postError=${result.reason}`,
  );
}

export async function deleteListingDraftAction(form: FormData): Promise<void> {
  const { did } = await requireOrganisation();
  await deleteListingDraft(did, listingKey(form));
  redirect('/organisation?deleted=1');
}

/** A quick status change from the dashboard. */
export async function changeStatusAction(form: FormData): Promise<void> {
  const { did, client } = await requireOrganisation();
  const rkey = listingKey(form);
  const to = String(form.get('to') ?? '');
  const adoptedAt = form.get('adoptedAt');
  const result = await changeListingStatus(
    did,
    client,
    rkey,
    to,
    typeof adoptedAt === 'string' ? adoptedAt : undefined,
  );
  redirect(
    result.ok
      ? `/organisation?changed=${to}&listing=${rkey}`
      : `/organisation?error=${result.reason}&listing=${rkey}`,
  );
}

/** Deletes a withdrawn listing for good, from the dashboard. */
export async function deleteListingAction(form: FormData): Promise<void> {
  const { did, client } = await requireOrganisation();
  const rkey = listingKey(form);
  const result = await deleteWithdrawnListing(did, client, rkey);
  redirect(result.ok ? '/organisation?removed=1' : `/organisation?error=${result.reason}`);
}
