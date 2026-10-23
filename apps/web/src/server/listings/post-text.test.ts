import { describe, expect, it } from 'vitest';
import { checkPostText, postUrl, richTextFacets } from './post-text';

const utf8 = new TextEncoder();
const slice = (text: string, start: number, end: number) =>
  new TextDecoder().decode(utf8.encode(text).slice(start, end));

describe('post text', () => {
  it('checks length in graphemes and bytes', () => {
    expect(checkPostText('  ')).toBe('empty');
    expect(checkPostText('x'.repeat(300))).toBeUndefined();
    expect(checkPostText('x'.repeat(301))).toBe('tooLong');
    expect(checkPostText('🐇'.repeat(300))).toBeUndefined();
  });

  it('finds hashtags and links at their byte offsets', () => {
    const text =
      'Brünhilde 🐇 sucht ein Zuhause! #AdoptDontShop #Rabbits. See https://homeward.example/x, #2026 #';
    const facets = richTextFacets(text);
    expect(
      facets.map((f) => [slice(text, f.index.byteStart, f.index.byteEnd), f.features[0]]),
    ).toEqual([
      ['#AdoptDontShop', { $type: 'app.bsky.richtext.facet#tag', tag: 'AdoptDontShop' }],
      ['#Rabbits', { $type: 'app.bsky.richtext.facet#tag', tag: 'Rabbits' }],
      [
        'https://homeward.example/x',
        { $type: 'app.bsky.richtext.facet#link', uri: 'https://homeward.example/x' },
      ],
    ]);
  });

  it('links to the post on bsky.app', () => {
    expect(postUrl('at://did:plc:hillfarm/app.bsky.feed.post/3m5z2kq5qnsla')).toBe(
      'https://bsky.app/profile/did:plc:hillfarm/post/3m5z2kq5qnsla',
    );
    expect(postUrl('at://did:plc:hillfarm/pet.homeward.listing/3m5z2kq5qnsla')).toBeUndefined();
  });
});
