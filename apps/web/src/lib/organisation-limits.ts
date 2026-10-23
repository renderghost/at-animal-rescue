/**
 * Limits on the organisation profile, as in the pet.homeward.org.profile lexicon. Shared by
 * the server-side parser and the forms (kept free of dependencies for the browser bundle).
 */

export const MAX_DONATION_LINKS = 10;

const utf8 = new TextEncoder();
const graphemes = new Intl.Segmenter();
const length = (value: string) => [...graphemes.segment(value)].length;

/**
 * Maximum lengths, as in the lexicon: text is limited in graphemes (and allows ten bytes
 * for each), while addresses and numbers are limited in bytes.
 */
const TEXT_LIMITS: Record<string, number> = {
  displayName: 100,
  locality: 100,
  region: 100,
  description: 3000,
  adoptionProcess: 3000,
  donationLabel: 100,
  charityRegistry: 100,
};
const BYTE_LIMITS: Record<string, number> = {
  email: 254,
  website: 2000,
  donationUrl: 2000,
  charityNumber: 64,
  charityUrl: 2000,
};

/** The maximum length of a field, e.g. for "Keep this to 100 characters or fewer". */
export function limitOf(field: string): number | undefined {
  const key = field.replace(/\.\d+$/, '');
  return TEXT_LIMITS[key] ?? BYTE_LIMITS[key];
}

/** Whether a value fits its field's limit. */
export function fits(field: string, value: string): boolean {
  const key = field.replace(/\.\d+$/, '');
  const bytes = utf8.encode(value).length;
  const text = TEXT_LIMITS[key];
  if (text !== undefined) return bytes <= text * 10 && length(value) <= text;
  return bytes <= BYTE_LIMITS[key]!;
}
