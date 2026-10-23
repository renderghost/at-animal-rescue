import 'server-only';
import { listingPath } from '@/lib/fit';
import { listingTitle } from '../listings/listing-form';
import { getPublicOrg } from '../org-page/org';
import { loadListingPage } from './listing';

/**
 * "Back to Bonnie and Clyde" on the adopter profile, for an adopter who came from a
 * listing's "Answer in your profile" link (#40). Only for a listing page on this site that
 * they may see, so the link can't lead elsewhere or reveal a hidden listing's title.
 */
export async function listingBackLink(
  from: string | undefined,
  locale: string,
): Promise<{ href: string; title: string } | undefined> {
  const target = listingPath(from);
  if (!target) return undefined;
  const org = await getPublicOrg(
    target.org.startsWith('did:') ? { did: target.org } : { handle: target.org },
  );
  const view = org && (await loadListingPage(org, target.rkey));
  if (!org || !view || view.hiddenBecause.length > 0) return undefined;
  const names = view.animals.map(({ rkey, record }) => ({ rkey, name: record.name }));
  return { href: target.path, title: listingTitle(org.did, view.listing, names, locale) };
}
