import 'server-only';
import { listingTitle } from '../listings/listing-form';
import { getPublicOrg, type PublicOrg } from '../org-page/org';
import { loadListingPage, type ListingView } from './listing';

export interface PublicListing {
  org: PublicOrg;
  view: ListingView;
  title: string;
  /** The listing page's path, e.g. /org/hillfarm.example/listings/3m5z2kq5qns2l. */
  path: string;
  uri: string;
}

/** A listing anyone can see, by its organisation's handle or DID and its record key. */
export async function publicListing(
  orgId: string,
  rkey: string,
  locale: string,
): Promise<PublicListing | undefined> {
  const org = await getPublicOrg(orgId.startsWith('did:') ? { did: orgId } : { handle: orgId });
  const view = org && (await loadListingPage(org, rkey));
  if (!org || !view || view.hiddenBecause.length > 0) return undefined;
  const names = view.animals.map(({ rkey: key, record }) => ({ rkey: key, name: record.name }));
  return {
    org,
    view,
    title: listingTitle(org.did, view.listing, names, locale),
    path: `/org/${encodeURIComponent(org.handle ?? org.did)}/listings/${view.rkey}`,
    uri: `at://${org.did}/pet.homeward.listing/${view.rkey}`,
  };
}
