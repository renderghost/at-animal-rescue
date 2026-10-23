import 'server-only';
import { jsonToLex } from '@atproto/lex';
import {
  findOrg,
  OrgFactsStore,
  searchListings,
  type ListingSearch,
  type OrgFacts,
} from '@homeward/db';
import { pet } from '@homeward/lexicons';
import { getDb } from '../db';
import type { OrganisationProfile } from '../onboarding/organisation-form';

export interface PublicOrg {
  did: string;
  handle?: string;
  /** Approved by a moderator, so its listings are public. */
  approved: boolean;
  profile: OrganisationProfile;
}

/** An organisation as indexed, with its profile checked against the lexicon. */
export async function getPublicOrg(
  by: { did: string } | { handle: string },
): Promise<PublicOrg | undefined> {
  const org = await findOrg(getDb(), by);
  if (!org) return undefined;
  const parsed = pet.homeward.org.profile.$safeParse(
    jsonToLex(org.record as Parameters<typeof jsonToLex>[0]),
  );
  if (!parsed.success) return undefined;
  const { $type: _type, ...profile } = parsed.value;
  return { did: org.did, handle: org.handle, approved: org.approved, profile };
}

/** One organisation's listings. Its own staff also see those that aren't public yet. */
export function orgListings(org: PublicOrg, viewerDid: string | undefined, search: ListingSearch) {
  return searchListings(getDb(), {
    ...search,
    orgDid: org.did,
    includeUnmoderated: viewerDid === org.did,
  });
}

/** The facts Homeward has checked about an organisation (#29), if any yet. */
export function orgFacts(did: string): Promise<OrgFacts | undefined> {
  return new OrgFactsStore(getDb()).get(did);
}
