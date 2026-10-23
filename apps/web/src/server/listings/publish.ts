import type { Client } from '@atproto/lex';
import type { PrivateBlobStore, PrivateStore } from '@homeward/db';
import { pet } from '@homeward/lexicons';
import { draftFiles, photoCid } from '../animals/animals';
import type { AnimalRecord } from '../animals/animal-form';
import type { ListingRecord } from './listing-form';

type Photo = NonNullable<AnimalRecord['photos']>[number];

export interface PublishDeps {
  client: Pick<Client, 'put' | 'uploadBlob'>;
  store: Pick<PrivateStore, 'get' | 'delete'>;
  blobs: Pick<PrivateBlobStore, 'get' | 'delete'>;
}

export class PublishError extends Error {
  constructor(readonly reason: 'unavailable' | 'photoMissing') {
    super(reason);
  }
}

/**
 * Moves a draft animal and its photos to the organisation's repository under the same
 * record key, then deletes the private copies. Safe to run again after a failure: the
 * draft stays until the public record is written.
 */
export async function publishAnimal(
  { client, store, blobs }: PublishDeps,
  did: string,
  rkey: string,
): Promise<void> {
  const draft = await store.get(did, 'pet.homeward.animal', rkey);
  if (!draft) return; // already public
  const { $type: _type, ...animal } = draft;
  const photos: Photo[] = [];
  for (const photo of animal.photos ?? []) {
    const file = await blobs.get({ did, record: draftFiles(rkey), cid: photoCid(photo) });
    if (!file) throw new PublishError('photoMissing');
    try {
      const encoding = file.mimeType as `${string}/${string}`;
      const { body } = await client.uploadBlob(file.bytes, { encoding });
      photos.push({ ...photo, image: body.blob as Photo['image'] });
    } catch {
      throw new PublishError('unavailable');
    }
  }
  const { photos: _drafts, ...rest } = animal;
  try {
    await client.put(pet.homeward.animal, photos.length > 0 ? { ...rest, photos } : rest, {
      rkey,
    });
  } catch {
    throw new PublishError('unavailable');
  }
  await store.delete(did, 'pet.homeward.animal', rkey);
  await blobs.delete(did, draftFiles(rkey));
}

/**
 * Publishes a draft listing as available: its draft animals first (so the listing never
 * points at animals that aren't public), then the listing, then the draft is deleted.
 */
export async function publishListing(
  deps: PublishDeps,
  did: string,
  rkey: string,
  listing: ListingRecord,
  draftAnimals: readonly string[],
): Promise<void> {
  for (const animal of draftAnimals) await publishAnimal(deps, did, animal);
  try {
    await deps.client.put(pet.homeward.listing, { ...listing, status: 'available' }, { rkey });
  } catch {
    throw new PublishError('unavailable');
  }
  await deps.store.delete(did, 'pet.homeward.listing', rkey);
}
