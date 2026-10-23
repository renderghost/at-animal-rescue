import 'server-only';
import sharp, { type OutputInfo } from 'sharp';
import { PHOTO_LIMITS } from '@/lib/media';

export interface ProcessedPhoto {
  bytes: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

export class PhotoError extends Error {
  constructor(readonly reason: 'unreadable' | 'tooLarge') {
    super(reason);
  }
}

/**
 * Re-encodes an uploaded photo for the PDS: turned upright, at most 2000 px on its longest
 * side, as a JPEG under the lexicon's 2 MB limit. Re-encoding drops all metadata, including
 * GPS location (EXIF), whatever the browser did or didn't do first.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.length > PHOTO_LIMITS.uploadBytes) throw new PhotoError('tooLarge');
  for (const [maxSide, quality] of [
    [PHOTO_LIMITS.maxSide, 82],
    [PHOTO_LIMITS.maxSide, 70],
    [1600, 70],
    [1200, 65],
  ] as const) {
    let result: { data: Buffer; info: OutputInfo };
    try {
      result = await sharp(input, { limitInputPixels: 100_000_000 })
        .rotate() // apply the EXIF orientation before the metadata goes
        .flatten({ background: '#ffffff' }) // JPEG has no transparency; white, not black
        .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new PhotoError('unreadable');
    }
    if (result.data.length <= PHOTO_LIMITS.storedBytes) {
      return {
        bytes: result.data,
        mimeType: 'image/jpeg',
        width: result.info.width,
        height: result.info.height,
      };
    }
  }
  throw new PhotoError('tooLarge');
}
