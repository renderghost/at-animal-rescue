import 'server-only';
import { jsonToLex } from '@atproto/lex';
import { getListing, type ShareLink } from '@homeward/db';
import { pet } from '@homeward/lexicons';
import type { MatchState, MatchSummary } from '@homeward/matching';
import { getTranslations } from 'next-intl/server';
import { criterionText } from '@/components/CriteriaList';
import { formatDistance } from '@/lib/format';
import { fetchPublicRecord } from '../atproto/public-repo';
import { getDb } from '../db';
import { fitOf } from '../listing-page/fit';
import { animalKey, listingTitle } from '../listings/listing-form';
import { getPublicOrg } from '../org-page/org';
import { getPrivateStore } from '../private-store';
import { householdAnswers, type QuestionAndAnswer } from './answers';

export interface ShareContent {
  handle: string;
  /** From their public adopter profile, if they published one. */
  about?: string;
  /** "Lives in Utrecht, about 35 km from Misty." */
  place?: string;
  /** They deleted their answers after sending the link. */
  removed: boolean;
  answers: QuestionAndAnswer[];
  fit?: {
    summary: MatchSummary;
    summaryLabel: string;
    rows: Array<{
      text: string;
      level: string;
      state: MatchState;
      stateLabel: string;
      description?: string;
    }>;
  };
  title: string;
  listingPath?: string;
  until: string;
}

/** What a listing is called and where it is, whatever its status now. */
export async function sharedListing(link: ShareLink, locale: string) {
  const [org, row] = await Promise.all([
    getPublicOrg({ did: link.orgDid }),
    getListing(getDb(), link.listingUri),
  ]);
  const parsed =
    row &&
    pet.homeward.listing.$safeParse(jsonToLex(row.record as Parameters<typeof jsonToLex>[0]));
  const listing = parsed?.success ? parsed.value : undefined;
  const names = (row?.animals ?? []).map((animal) => ({
    rkey: animalKey(link.orgDid, animal.uri) ?? '',
    name: animal.name,
  }));
  return {
    org,
    listing,
    title: listing ? listingTitle(link.orgDid, listing, names, locale) : undefined,
    path:
      org && listing
        ? `/org/${encodeURIComponent(org.handle ?? org.did)}/listings/${link.listingUri.split('/').pop()}`
        : undefined,
  };
}

async function publicAbout(did: string): Promise<string | undefined> {
  try {
    const record = await fetchPublicRecord(did, 'pet.homeward.adopter.profile', 'self');
    if (!record) return undefined;
    const parsed = pet.homeward.adopter.profile.$safeParse(
      jsonToLex(record as Parameters<typeof jsonToLex>[0]),
    );
    return parsed.success ? parsed.value.about : undefined;
  } catch {
    return undefined; // their PDS is unreachable: show the rest
  }
}

/**
 * What an organisation sees through a share link (#42): the adopter's current answers, how
 * they fit the listing, their town and distance, and their handle. Never stored.
 */
export async function shareContent(
  link: ShareLink,
  { locale, unit }: { locale: string; unit: 'kilometer' | 'mile' },
): Promise<ShareContent> {
  const t = await getTranslations('Share');
  const match = await getTranslations('Match');
  const store = getPrivateStore();
  const [household, location, shared, about] = await Promise.all([
    store.get(link.adopterDid, 'pet.homeward.adopter.household', 'self'),
    store.get(link.adopterDid, 'pet.homeward.adopter.location', 'self'),
    sharedListing(link, locale),
    publicAbout(link.adopterDid),
  ]);
  const title = shared.title ?? t('unknownListing');
  const until = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(link.expiresAt);
  const base = {
    handle: link.adopterHandle,
    ...(about && { about }),
    title,
    ...(shared.path && { listingPath: shared.path }),
    until,
  };
  if (!household) return { ...base, removed: true, answers: [] };

  const { $type: _type, ...answers } = household;
  const fit = shared.listing
    ? await fitOf({
        household: answers,
        location,
        listingUri: link.listingUri,
        criteria: shared.listing.criteria,
      })
    : undefined;
  const text = await criterionText();
  const criteria = shared.listing?.criteria ?? [];
  const place = location?.label
    ? fit?.distanceKm !== undefined
      ? t('place', {
          place: location.label,
          distance: formatDistance(Math.max(fit.distanceKm, 1), unit, locale),
          title,
        })
      : t('placeOnly', { place: location.label })
    : undefined;
  return {
    ...base,
    removed: false,
    ...(place && { place }),
    answers: await householdAnswers(answers),
    ...(fit && {
      fit: {
        summary: fit.summary,
        summaryLabel: match(fit.summary),
        rows: fit.criteria.map((row, i) => {
          const criterion = criteria[i]!;
          const description = (criterion as { description?: unknown }).description;
          return {
            text: text(criterion),
            level: match(row.level),
            state: row.state,
            stateLabel: match(row.state),
            ...(typeof description === 'string' && { description }),
          };
        }),
      },
    }),
  };
}
