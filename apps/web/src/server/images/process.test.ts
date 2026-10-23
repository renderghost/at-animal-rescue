import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { PhotoError, processPhoto } from './process';

vi.mock('server-only', () => ({}));

/** A noisy photo, so it compresses like a real one, with GPS coordinates in its EXIF. */
async function phonePhoto(width: number, height: number) {
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 251;
  return sharp(noise, { raw: { width, height, channels: 3 } })
    .withExif({
      IFD0: { Make: 'PhoneCo', Model: 'Phone 12' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '52/1 5/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '5/1 7/1 0/1',
      },
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe('processPhoto', () => {
  it('shrinks to 2000 px, re-encodes as JPEG and drops all metadata', async () => {
    const input = await phonePhoto(3000, 2000);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const photo = await processPhoto(input);
    const meta = await sharp(photo.bytes).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 2000, height: 1333 });
    expect(meta.exif).toBeUndefined();
    expect(photo).toMatchObject({ mimeType: 'image/jpeg', width: 2000, height: 1333 });
    expect(photo.bytes.length).toBeLessThanOrEqual(1_900_000);
  });

  it('never enlarges small photos', async () => {
    const photo = await processPhoto(await phonePhoto(640, 480));
    expect(photo).toMatchObject({ width: 640, height: 480 });
  });

  it('puts transparent images on white, as JPEG has no transparency', async () => {
    const png = await sharp({
      create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const { data } = await sharp((await processPhoto(png)).bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(Math.min(...data)).toBeGreaterThan(245);
  });

  it('rejects files that are not images', async () => {
    await expect(processPhoto(Buffer.from('not an image'))).rejects.toEqual(
      new PhotoError('unreadable'),
    );
  });
});
