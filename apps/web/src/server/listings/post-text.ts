/** Bluesky's limit for a post's text (app.bsky.feed.post). */
export const POST_LIMITS = { graphemes: 300, bytes: 3000 } as const;

const graphemes = new Intl.Segmenter();
const utf8 = new TextEncoder();

export function checkPostText(text: string): 'empty' | 'tooLong' | undefined {
  if (!text.trim()) return 'empty';
  if (
    [...graphemes.segment(text)].length > POST_LIMITS.graphemes ||
    utf8.encode(text).length > POST_LIMITS.bytes
  ) {
    return 'tooLong';
  }
  return undefined;
}

export interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Array<
    | { $type: 'app.bsky.richtext.facet#tag'; tag: string }
    | { $type: 'app.bsky.richtext.facet#link'; uri: string }
  >;
}

// Hashtags: '#' after a space or the start, not only digits, without trailing punctuation.
const TAG = /(^|\s)#([^\s#]*[^\d\s\p{P}][^\s#]*)/gu;
const LINK = /(^|\s)(https?:\/\/[^\s]+)/gu;
const TRAILING_PUNCTUATION = /\p{P}+$/u;

/**
 * Rich-text facets for hashtags and links, so Bluesky shows them as tags and links. Facets
 * point at UTF-8 byte offsets, not characters.
 */
export function richTextFacets(text: string): Facet[] {
  const byteOffset = (index: number) => utf8.encode(text.slice(0, index)).length;
  const facets: Facet[] = [];
  for (const match of text.matchAll(TAG)) {
    const tag = match[2]!.replace(TRAILING_PUNCTUATION, '');
    if (!tag || [...graphemes.segment(tag)].length > 64) continue;
    const start = match.index! + match[1]!.length;
    facets.push({
      index: { byteStart: byteOffset(start), byteEnd: byteOffset(start + 1 + tag.length) },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag }],
    });
  }
  for (const match of text.matchAll(LINK)) {
    const uri = match[2]!.replace(/[.,;:!?)]+$/, '');
    const start = match.index! + match[1]!.length;
    facets.push({
      index: { byteStart: byteOffset(start), byteEnd: byteOffset(start + uri.length) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
    });
  }
  return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

/** A post's address on bsky.app, from its AT URI. */
export function postUrl(uri: string): string | undefined {
  const match = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return match ? `https://bsky.app/profile/${match[1]}/post/${match[2]}` : undefined;
}
