import { describe, expect, it } from 'vitest';
import {
  DSA_CATEGORIES,
  looksLikeEmail,
  parseListingUri,
  REASON_CATEGORY,
  REPORT_REASONS,
} from './reports';

describe('report reasons', () => {
  it('start every reason but "other illegal content" from a DSA category', () => {
    for (const reason of REPORT_REASONS) {
      const category = REASON_CATEGORY[reason];
      if (reason === 'otherIllegal') expect(category).toBeUndefined();
      else expect(DSA_CATEGORIES).toContain(category);
    }
    expect(DSA_CATEGORIES).toHaveLength(14);
  });
});

describe('looksLikeEmail', () => {
  it('accepts plausible addresses and refuses the rest', () => {
    expect(looksLikeEmail('sam@example.org')).toBe(true);
    expect(looksLikeEmail('sam@example')).toBe(false);
    expect(looksLikeEmail('sam example@x.org')).toBe(false);
    expect(looksLikeEmail(`${'a'.repeat(250)}@x.org`)).toBe(false);
  });
});

describe('parseListingUri', () => {
  it('takes listing URIs only', () => {
    const uri = 'at://did:plc:abc123/pet.homeward.listing/3l2bbbbbbbbbb';
    expect(parseListingUri(uri)).toEqual({ uri, did: 'did:plc:abc123' });
    expect(
      parseListingUri('at://did:plc:abc123/pet.homeward.animal/3l2bbbbbbbbbb'),
    ).toBeUndefined();
    expect(parseListingUri('at://did:plc:abc123/pet.homeward.listing/nope')).toBeUndefined();
    expect(parseListingUri('at://notadid/pet.homeward.listing/3l2bbbbbbbbbb')).toBeUndefined();
    expect(parseListingUri(null)).toBeUndefined();
  });
});
