import 'server-only';
import { listingDistanceKm } from '@homeward/db';
import {
  evaluateMatch,
  type CriterionLevel,
  type Household,
  type MatchState,
  type MatchSummary,
} from '@homeward/matching';
import { answerOf, unknownOf, type Answer, type Unknown } from '@/lib/fit';
import { getCurrentUser } from '../auth/session';
import { getDb } from '../db';
import { getCurrentRole } from '../onboarding/current-role';
import { getPrivateStore } from '../private-store';
import type { ListingRecord } from '../listings/listing-form';
import type { ListingView } from './listing';

export interface CriterionFit {
  state: MatchState;
  level: CriterionLevel;
  /** What the adopter told us, for a match or a conflict. */
  answer?: Answer;
  /** Why it couldn't be checked. */
  unknown?: Unknown;
}

export type ListingFit =
  | { kind: 'none' }
  /** Signed out, or signed in without choosing to adopt yet. */
  | { kind: 'invite'; viewer: 'anonymous' | 'newcomer' }
  | {
      kind: 'match';
      summary: MatchSummary;
      /** In the listing's own order, one per criterion. */
      criteria: CriterionFit[];
      conflicts: number;
      unknowns: number;
    };

function coordinates(place: { latitude?: string; longitude?: string } | undefined) {
  if (!place?.latitude || !place.longitude) return undefined;
  const latitude = Number(place.latitude);
  const longitude = Number(place.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : undefined;
}

/**
 * How a listing fits the person viewing it (#40), from their private household answers and
 * location. Worked out on each request for that adopter only, and never stored or shared.
 */
export async function listingFit(did: string, view: ListingView): Promise<ListingFit> {
  // Organisations don't adopt, and there's nothing to apply for once an animal is adopted.
  if (view.owner || view.listing.status === 'adopted') return { kind: 'none' };
  const user = await getCurrentUser();
  if (!user) return { kind: 'invite', viewer: 'anonymous' };
  const role = await getCurrentRole();
  if (role === 'organisation') return { kind: 'none' };

  const store = getPrivateStore();
  const [household, location] =
    role === 'adopter'
      ? await Promise.all([
          store.get(user.did, 'pet.homeward.adopter.household', 'self'),
          store.get(user.did, 'pet.homeward.adopter.location', 'self'),
        ])
      : [undefined, undefined];
  if (!household) return { kind: 'invite', viewer: 'newcomer' };

  const { $type: _type, ...answers } = household;
  return fitOf({
    household: answers,
    location,
    listingUri: `at://${did}/pet.homeward.listing/${view.rkey}`,
    criteria: view.listing.criteria,
  });
}

export type Fit = Extract<ListingFit, { kind: 'match' }> & { distanceKm?: number };

/**
 * How a listing's criteria fit a household, with distance from the adopter's private
 * location, measured as search measures it. For the adopter themselves (#40) and for an
 * organisation they shared their answers with (#42).
 */
export async function fitOf({
  household,
  location,
  listingUri,
  criteria: listingCriteria,
}: {
  household: Household;
  location?: { latitude?: string; longitude?: string };
  listingUri: string;
  criteria?: ListingRecord['criteria'];
}): Promise<Fit> {
  const from = coordinates(location);
  const distanceKm = from && (await listingDistanceKm(getDb(), listingUri, from));
  const result = evaluateMatch({ criteria: listingCriteria, household, distanceKm });
  const criteria = result.criteria.map((evaluation): CriterionFit => {
    const { state, level } = evaluation;
    return state === 'unknown'
      ? { state, level, unknown: unknownOf(evaluation, household, from !== undefined) }
      : { state, level, answer: answerOf(evaluation) };
  });
  return {
    kind: 'match',
    summary: result.summary,
    criteria,
    conflicts: criteria.filter(({ state }) => state === 'conflict').length,
    unknowns: criteria.filter(({ state }) => state === 'unknown').length,
    ...(distanceKm !== undefined && { distanceKm }),
  };
}
