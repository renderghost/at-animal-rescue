import 'server-only';
import { cidForRawBytes, type Client } from '@atproto/lex';
import { PrivateBlobStore } from '@homeward/db';
import { pet } from '@homeward/lexicons';
import { PHOTO_LIMITS, MAX_VIDEOS } from '@/lib/media';
import { parseVideoLink } from '@/lib/videos';
import { getDb, getKeyring } from '../db';
import { processPhoto } from '../images/process';
import { getPrivateStore } from '../private-store';
import { draftFiles, loadAnimal, photoCid } from './animals';
import type { AnimalRecord } from './animal-form';

type Photo = NonNullable<AnimalRecord['photos']>[number];

const DRAFT = 'pet.homeward.animal';
const graphemes = new Intl.Segmenter();
const length = (value: string) => [...graphemes.segment(value)].length;

export const privateBlobs = () => new PrivateBlobStore(getDb(), getKeyring());

export class MediaError extends Error {
  constructor(
    readonly reason:
      | 'notFound'
      | 'unavailable'
      | 'tooMany'
      | 'duplicate'
      | 'altRequired'
      | 'altTooLong'
      | 'unreadable'
      | 'tooLarge',
  ) {
    super(reason);
  }
}

/** Applies a change to an animal's photos or videos, wherever the animal lives now. */
async function changeAnimal(
  did: string,
  client: Client,
  rkey: string,
  change: (animal: AnimalRecord, published: boolean) => Promise<AnimalRecord> | AnimalRecord,
): Promise<{ after: AnimalRecord; published: boolean }> {
  const found = await loadAnimal(did, client, rkey);
  if (found.kind === 'missing') throw new MediaError('notFound');
  if (found.kind === 'unavailable') throw new MediaError('unavailable');
  const after = await change(found.record, found.published);
  if (found.published) {
    try {
      await client.put(pet.homeward.animal, after, { rkey });
    } catch {
      throw new MediaError('unavailable');
    }
  } else {
    await getPrivateStore().put(did, DRAFT, rkey, { $type: DRAFT, ...after });
  }
  return { after, published: found.published };
}

function checkAlt(alt: string): string {
  const text = alt.trim();
  if (!text) throw new MediaError('altRequired');
  if (length(text) > PHOTO_LIMITS.alt) throw new MediaError('altTooLong');
  return text;
}

/**
 * Adds a photo: always re-encoded here (which strips GPS and other metadata). A published
 * animal's photo goes to the organisation's account; a draft's stays with Homeward until the
 * animal is first listed, referenced by the CID the PDS will give it.
 */
export async function addPhoto(
  did: string,
  client: Client,
  rkey: string,
  upload: Buffer,
  altText: string,
): Promise<void> {
  const alt = checkAlt(altText);
  let processed;
  try {
    processed = await processPhoto(upload);
  } catch (err) {
    const reason = (err as { reason?: string }).reason;
    throw new MediaError(reason === 'tooLarge' ? 'tooLarge' : 'unreadable');
  }
  // The CID the PDS will give it, so each photo is there once and can be told apart.
  const ref = await cidForRawBytes(processed.bytes);
  await changeAnimal(did, client, rkey, async (animal, published) => {
    const photos = animal.photos ?? [];
    if (photos.length >= PHOTO_LIMITS.count) throw new MediaError('tooMany');
    if (photos.some((photo) => photoCid(photo) === ref.toString())) {
      throw new MediaError('duplicate');
    }
    let image: Photo['image'];
    if (published) {
      try {
        const { body } = await client.uploadBlob(processed.bytes, { encoding: processed.mimeType });
        image = body.blob as Photo['image'];
      } catch {
        throw new MediaError('unavailable');
      }
    } else {
      await privateBlobs().put(
        { did, record: draftFiles(rkey), cid: ref.toString() },
        processed.mimeType,
        processed.bytes,
      );
      image = { $type: 'blob', ref, mimeType: processed.mimeType, size: processed.bytes.length };
    }
    const photo: Photo = {
      image,
      alt,
      aspectRatio: { width: processed.width, height: processed.height },
    };
    return { ...animal, photos: [...photos, photo] };
  });
}

/** Finds a photo by its file's CID, so a stale page can never change the wrong one. */
function photoIndex(animal: AnimalRecord, cid: string): number {
  const index = (animal.photos ?? []).findIndex((photo) => photoCid(photo) === cid);
  if (index < 0) throw new MediaError('notFound');
  return index;
}

export async function updatePhotoAlt(
  did: string,
  client: Client,
  rkey: string,
  cid: string,
  altText: string,
): Promise<void> {
  const alt = checkAlt(altText);
  await changeAnimal(did, client, rkey, (animal) => {
    const photos = [...(animal.photos ?? [])];
    const index = photoIndex(animal, cid);
    photos[index] = { ...photos[index]!, alt };
    return { ...animal, photos };
  });
}

/** Moves a photo one place, or to the front as the cover photo. */
export async function movePhoto(
  did: string,
  client: Client,
  rkey: string,
  cid: string,
  to: 'earlier' | 'later' | 'cover',
): Promise<void> {
  await changeAnimal(did, client, rkey, (animal) => {
    const photos = [...(animal.photos ?? [])];
    const index = photoIndex(animal, cid);
    const [photo] = photos.splice(index, 1);
    const target = to === 'cover' ? 0 : to === 'earlier' ? index - 1 : index + 1;
    photos.splice(Math.max(0, Math.min(target, photos.length)), 0, photo!);
    return { ...animal, photos };
  });
}

export async function removePhoto(
  did: string,
  client: Client,
  rkey: string,
  cid: string,
): Promise<void> {
  const { after, published } = await changeAnimal(did, client, rkey, (animal) => {
    const photos = [...(animal.photos ?? [])];
    photos.splice(photoIndex(animal, cid), 1);
    const { photos: _old, ...rest } = animal;
    return photos.length > 0 ? { ...rest, photos } : rest;
  });
  // A draft's file is ours to delete; the PDS clears up files no record uses any more.
  if (!published && !after.photos?.some((photo) => photoCid(photo) === cid)) {
    await privateBlobs().delete(did, draftFiles(rkey), [cid]);
  }
}

export type VideoErrors = Partial<Record<string, 'invalid'>>;

/** Replaces the video links, keeping each as its canonical watch address. */
export async function setVideos(
  did: string,
  client: Client,
  rkey: string,
  links: string[],
): Promise<{ ok: true } | { ok: false; errors: VideoErrors }> {
  const errors: VideoErrors = {};
  const videos: NonNullable<AnimalRecord['videos']> = [];
  links.slice(0, MAX_VIDEOS).forEach((link, i) => {
    if (!link.trim()) return;
    const video = parseVideoLink(link);
    if (!video) errors[`video.${i}`] = 'invalid';
    else {
      // Watch addresses are always https URLs, which the lexicon's uri format expects.
      const url = video.watchUrl as (typeof videos)[number];
      if (!videos.includes(url)) videos.push(url);
    }
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  await changeAnimal(did, client, rkey, (animal) => {
    const { videos: _old, ...rest } = animal;
    return videos.length > 0 ? { ...rest, videos } : rest;
  });
  return { ok: true };
}
