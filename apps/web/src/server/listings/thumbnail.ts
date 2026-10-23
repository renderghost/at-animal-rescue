import type { Client } from '@atproto/lex';
import sharp from 'sharp';
import type { AnimalRecord } from '../animals/animal-form';
import { photoCid } from '../animals/animals';

type Image = NonNullable<AnimalRecord['photos']>[number]['image'];

/** Bluesky's limit for a link card's thumbnail (app.bsky.embed.external). */
export const THUMB_BYTES = 1_000_000;

/**
 * The link card's thumbnail: the cover photo itself when it's small enough (a blob can be
 * referenced again in the same repository), otherwise a smaller copy uploaded for the card.
 * Without one, the card simply has no picture.
 */
export async function linkCardThumbnail(
  client: Pick<Client, 'getBlob' | 'uploadBlob'>,
  did: string,
  cover: Image | undefined,
): Promise<Image | undefined> {
  if (!cover) return undefined;
  // Older blob references carry no size: those are always re-encoded.
  if ('size' in cover && cover.size <= THUMB_BYTES) return cover;
  try {
    const { body } = await client.getBlob(
      did as `did:${string}:${string}`,
      photoCid({ image: cover, alt: '' }) as never,
    );
    const bytes = await sharp(Buffer.from(body as Uint8Array))
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    if (bytes.length > THUMB_BYTES) return undefined;
    const uploaded = await client.uploadBlob(bytes, { encoding: 'image/jpeg' });
    return uploaded.body.blob as Image;
  } catch (err) {
    console.warn('Could not make a link card thumbnail', err);
    return undefined;
  }
}
