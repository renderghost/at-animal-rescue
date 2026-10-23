import 'server-only';
import { jsonToLex } from '@atproto/lex';
import { isValidTid } from '@atproto/syntax';
import { getListing, PUBLIC_LISTING_STATUSES } from '@homeward/db';
import { pet } from '@homeward/lexicons';
import type { AnimalRecord } from '../animals/animal-form';
import { loadAnimal } from '../animals/animals';
import { getCurrentUser } from '../auth/session';
import { getDb } from '../db';
import { animalKey, type ListingRecord } from '../listings/listing-form';
import { loadListing } from '../listings/listings';
import { getRepoClient } from '../onboarding/current-role';
import type { PublicOrg } from '../org-page/org';

/** Why a listing isn't public, for its organisation's banner. */
export type HiddenReason = 'draft' | 'notListed' | 'awaitingApproval' | 'hiddenAfterReport';

export interface ListingView {
  rkey: string;
  listing: ListingRecord;
  animals: Array<{ rkey: string; record: AnimalRecord }>;
  /** Empty when the listing is public. */
  hiddenBecause: HiddenReason[];
  /** The organisation viewing its own listing: photos come through its private route. */
  owner: boolean;
}

const parse = <T>(
  schema: { $safeParse(v: unknown): { success: boolean; value?: T } },
  json: unknown,
) => {
  const result = schema.$safeParse(jsonToLex(json as Parameters<typeof jsonToLex>[0]));
  return result.success ? result.value : undefined;
};

/**
 * A listing for its public page (#35). Visitors see it only while it's public: available,
 * reserved or adopted, from an approved organisation, not hidden after a report. The
 * organisation sees its own from its account (so drafts and fresh edits too), with the
 * reasons it isn't public.
 */
export async function loadListingPage(
  org: PublicOrg,
  rkey: string,
): Promise<ListingView | undefined> {
  if (!isValidTid(rkey)) return undefined;
  const uri = `at://${org.did}/pet.homeward.listing/${rkey}`;
  const [viewer, row] = await Promise.all([getCurrentUser(), getListing(getDb(), uri)]);
  const owner = viewer?.did === org.did;
  const reasons = (status: string, published: boolean): HiddenReason[] => [
    ...(!published ? (['draft'] as const) : []),
    ...(published && !(PUBLIC_LISTING_STATUSES as readonly string[]).includes(status)
      ? (['notListed'] as const)
      : []),
    ...(!org.approved ? (['awaitingApproval'] as const) : []),
    ...(row?.moderation === 'hidden' ? (['hiddenAfterReport'] as const) : []),
  ];

  if (owner) {
    const client = await getRepoClient();
    const found = client && (await loadListing(org.did, client, rkey));
    if (client && found?.kind === 'found') {
      const animals = await Promise.all(
        found.record.animals.map(async (animalUri) => {
          const key = animalKey(org.did, animalUri) ?? '';
          const animal = await loadAnimal(org.did, client, key);
          return animal.kind === 'found' ? { rkey: key, record: animal.record } : undefined;
        }),
      );
      return {
        rkey,
        listing: found.record,
        animals: animals.filter((animal) => animal !== undefined),
        hiddenBecause: reasons(found.record.status, found.published),
        owner,
      };
    }
    // Their account is unreachable: show what the index has.
  }

  if (!row) return undefined;
  const listing = parse<pet.homeward.listing.Main>(pet.homeward.listing, row.record);
  if (!listing) return undefined;
  const hiddenBecause = reasons(listing.status, true);
  if (!owner && hiddenBecause.length > 0) return undefined;
  const { $type: _type, ...record } = listing;
  const animals = row.animals.flatMap((animal) => {
    const parsed = parse<pet.homeward.animal.Main>(pet.homeward.animal, animal.record);
    if (!parsed) return [];
    const { $type: _animal, ...animalRecord } = parsed;
    return [{ rkey: animal.uri.split('/').pop()!, record: animalRecord }];
  });
  return { rkey, listing: record, animals, hiddenBecause, owner };
}
