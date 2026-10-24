import 'server-only';
import { ShareLinkStore } from '@homeward/db';
import { getDb } from '../db';
import { publicListing, type PublicListing } from '../listing-page/public-listing';

export const MAX_MESSAGE = 2000;

export type EnquiryTarget = PublicListing;

/** A listing that can take enquiries: public, and not adopted yet. */
export async function enquiryTarget(
  orgId: string,
  rkey: string,
  locale: string,
): Promise<EnquiryTarget | undefined> {
  const target = await publicListing(orgId, rkey, locale);
  return target?.view.listing.status === 'adopted' ? undefined : target;
}

export function shareLinks() {
  return new ShareLinkStore(getDb());
}
