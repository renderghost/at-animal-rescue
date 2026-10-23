import { describe, expect, it } from 'vitest';
import { imageSrcSet, imageUrl, isImageWidth } from './images';

describe('public photo URLs', () => {
  it('builds a URL per width and a srcset of all three', () => {
    expect(imageUrl('did:plc:hillfarm', 'bafkreiabc', 800)).toBe(
      '/img/did:plc:hillfarm/bafkreiabc/800',
    );
    expect(imageSrcSet('did:plc:hillfarm', 'bafkreiabc')).toBe(
      '/img/did:plc:hillfarm/bafkreiabc/400 400w, /img/did:plc:hillfarm/bafkreiabc/800 800w, /img/did:plc:hillfarm/bafkreiabc/1600 1600w',
    );
    expect(isImageWidth(800)).toBe(true);
    expect(isImageWidth(500)).toBe(false);
  });
});
