import { cidForRawBytes } from '@atproto/lex';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { linkCardThumbnail, THUMB_BYTES } from './thumbnail';

vi.mock('server-only', () => ({}));

const did = 'did:plc:hillfarm';

async function noisyJpeg(width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2654435761) % 251;
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe('linkCardThumbnail', () => {
  it('reuses a cover photo that fits a link card', async () => {
    const client = { getBlob: vi.fn(), uploadBlob: vi.fn() };
    const cover = {
      $type: 'blob',
      ref: await cidForRawBytes(Buffer.from('x')),
      mimeType: 'image/jpeg',
      size: 500_000,
    } as never;
    expect(await linkCardThumbnail(client as never, did, cover)).toBe(cover);
    expect(client.getBlob).not.toHaveBeenCalled();
  });

  it('uploads a smaller copy of a large cover photo', async () => {
    const original = await noisyJpeg(2000, 1500);
    expect(original.length).toBeGreaterThan(THUMB_BYTES);
    const cover = {
      $type: 'blob',
      ref: await cidForRawBytes(original),
      mimeType: 'image/jpeg',
      size: original.length,
    } as never;
    const uploaded: Buffer[] = [];
    const client = {
      getBlob: vi.fn(async () => ({ body: new Uint8Array(original) })),
      uploadBlob: vi.fn(async (bytes: Buffer) => {
        uploaded.push(bytes);
        return { body: { blob: { $type: 'blob', size: bytes.length } } };
      }),
    };
    const thumb = await linkCardThumbnail(client as never, did, cover);
    expect(thumb).toMatchObject({ $type: 'blob' });
    expect(uploaded[0]!.length).toBeLessThanOrEqual(THUMB_BYTES);
    expect((await sharp(uploaded[0]).metadata()).width).toBe(1200);
  });

  it('posts without a picture when the cover photo can’t be fetched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = {
      getBlob: vi.fn(async () => Promise.reject(new Error('down'))),
      uploadBlob: vi.fn(),
    };
    const cover = {
      $type: 'blob',
      ref: await cidForRawBytes(Buffer.from('y')),
      mimeType: 'image/jpeg',
      size: 1_500_000,
    } as never;
    expect(await linkCardThumbnail(client as never, did, cover)).toBeUndefined();
    warn.mockRestore();
  });
});
