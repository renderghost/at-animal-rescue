import 'server-only';
import { ShareLinkStore } from '@homeward/db';
import { getDb } from '../db';
import { loadListingPage, type ListingView } from '../listing-page/listing';
import { listingTitle } from '../listings/listing-form';
import { getPublicOrg, type PublicOrg } from '../org-page/org';

export const MAX_MESSAGE = 2000;

export interface EnquiryTarget {
  org: PublicOrg;
  view: ListingView;
  title: string;
  /** The listing page's path, e.g. /org/hillfarm.example/listings/3m5z2kq5qns2l. */
  path: string;
}

/** A listing that can take enquiries: public, and not adopted yet. */
export async function enquiryTarget(
  orgId: string,
  rkey: string,
  locale: string,
): Promise<EnquiryTarget | undefined> {
  const org = await getPublicOrg(orgId.startsWith('did:') ? { did: orgId } : { handle: orgId });
  const view = org && (await loadListingPage(org, rkey));
  if (!org || !view || view.hiddenBecause.length > 0 || view.listing.status === 'adopted') {
    return undefined;
  }
  const names = view.animals.map(({ rkey: key, record }) => ({ rkey: key, name: record.name }));
  return {
    org,
    view,
    title: listingTitle(org.did, view.listing, names, locale),
    path: `/org/${encodeURIComponent(org.handle ?? org.did)}/listings/${view.rkey}`,
  };
}

export function shareLinks() {
  return new ShareLinkStore(getDb());
}
