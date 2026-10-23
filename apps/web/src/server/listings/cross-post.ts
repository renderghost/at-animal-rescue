import 'server-only';
import type { Client } from '@atproto/lex';
import { findOrg } from '@homeward/db';
import { pet } from '@homeward/lexicons';
import { getTranslations } from 'next-intl/server';
import { getPreferences } from '@/i18n/preferences';
import type { AnimalRecord } from '../animals/animal-form';
import { loadAnimal } from '../animals/animals';
import { getDb } from '../db';
import { lookupRecord } from '../onboarding/current-role';
import { siteOrigin } from '../site';
import { animalKey, listingTitle, type ListingRecord } from './listing-form';
import { loadListing } from './listings';
import { checkPostText, richTextFacets } from './post-text';
import { linkCardThumbnail } from './thumbnail';

export type CrossPostResult =
  | { ok: true; uri: string }
  | {
      ok: false;
      reason: 'empty' | 'tooLong' | 'alreadyPosted' | 'notPublished' | 'unavailable';
    };

interface PostContext {
  listing: ListingRecord;
  /** On the organisation's account, rather than a private draft. */
  published: boolean;
  animals: AnimalRecord[];
  title: string;
  url: string;
  place: string;
}

/** A listing (draft or published) with what a post about it needs. */
async function context(
  did: string,
  client: Client,
  rkey: string,
): Promise<PostContext | undefined> {
  const found = await loadListing(did, client, rkey);
  if (found.kind !== 'found') return undefined;
  const listing = found.record;
  const animals = await Promise.all(
    listing.animals.map(async (uri) => {
      const animal = await loadAnimal(did, client, animalKey(did, uri) ?? '');
      return animal.kind === 'found' ? animal.record : undefined;
    }),
  );
  const { formatLocale } = await getPreferences();
  const names = listing.animals.map((uri, i) => ({
    rkey: animalKey(did, uri) ?? '',
    name: animals[i]?.name ?? '',
  }));
  const [org, profile] = await Promise.all([
    findOrg(getDb(), { did }),
    lookupRecord(() => client.get(pet.homeward.org.profile)),
  ]);
  return {
    listing,
    published: found.published,
    animals: animals.filter((animal) => animal !== undefined),
    title: listingTitle(did, listing, names, formatLocale),
    url: `${await siteOrigin()}/org/${encodeURIComponent(org?.handle ?? did)}/listings/${rkey}`,
    place:
      listing.location?.locality ??
      (profile.kind === 'found' ? profile.record.location.locality : ''),
  };
}

/** The suggested post: who's looking for a home and where, the summary, then hashtags. */
export async function suggestedPostText(
  did: string,
  client: Client,
  rkey: string,
): Promise<string> {
  const post = await context(did, client, rkey);
  if (!post) return '';
  const t = await getTranslations('CrossPost');
  const species = [...new Set(post.animals.map((animal) => animal.species))];
  const tags = [
    t('adoptTag'),
    ...species.flatMap((key) => (t.has(`tags.${key}` as never) ? [t(`tags.${key}` as never)] : [])),
  ].join(' ');
  const opening = t('suggested', {
    title: post.title,
    count: post.listing.animals.length,
    place: post.place,
  });
  const full = [opening, post.listing.summary, tags].filter(Boolean).join('\n\n');
  // Drop the summary rather than go over Bluesky's limit.
  return checkPostText(full) ? `${opening}\n\n${tags}` : full;
}

/**
 * Posts a published listing on Bluesky from the organisation's account (#36): the text with
 * its hashtags and links, a link card to the listing, and the post's address stored on the
 * listing. One post per listing; Homeward never changes the post afterwards.
 */
export async function crossPostListing(
  did: string,
  client: Client,
  rkey: string,
  text: string,
): Promise<CrossPostResult> {
  const problem = checkPostText(text);
  if (problem) return { ok: false, reason: problem };
  const post = await context(did, client, rkey);
  if (!post?.published) return { ok: false, reason: 'notPublished' };
  if (post.listing.crossPost) return { ok: false, reason: 'alreadyPosted' };

  const { language } = await getPreferences();
  const cover = post.animals.flatMap((animal) => animal.photos ?? [])[0];
  const thumb = await linkCardThumbnail(client, did, cover?.image);
  const description = (post.listing.summary ?? post.animals[0]?.story ?? '').slice(0, 300);
  const facets = richTextFacets(text);
  let created: { uri: string; cid: string };
  try {
    const { body } = await client.createRecord({
      $type: 'app.bsky.feed.post',
      text,
      ...(facets.length > 0 && { facets }),
      langs: [language],
      embed: {
        $type: 'app.bsky.embed.external',
        external: { uri: post.url, title: post.title, description, ...(thumb && { thumb }) },
      },
      createdAt: new Date().toISOString(),
    } as never);
    created = body as { uri: string; cid: string };
  } catch (err) {
    console.warn('Could not post on Bluesky', err);
    return { ok: false, reason: 'unavailable' };
  }
  try {
    await client.put(
      pet.homeward.listing,
      { ...post.listing, crossPost: { uri: created.uri, cid: created.cid } } as ListingRecord,
      { rkey },
    );
  } catch (err) {
    // The post exists; only the link back is missing, so don't report it as failed.
    console.warn('Posted on Bluesky but could not store the post on the listing', err);
  }
  return { ok: true, uri: created.uri };
}
