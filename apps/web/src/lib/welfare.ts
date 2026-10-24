/**
 * Welfare rules for listings (#45). The minimum age is enforced; sale wording is only
 * flagged, because word lists also catch innocent uses. The wording and the rules await
 * review by rescue and veterinary experts (#11).
 */

/** Puppies and kittens can't be listed before this age, unless configured otherwise. */
export const DEFAULT_MIN_AGE_WEEKS = 8;
/** The species the minimum age applies to. */
const MIN_AGE_SPECIES = ['dog', 'cat'];
const DAY = 24 * 60 * 60 * 1000;

/**
 * The latest day an approximate birth date could mean ("2026" is 31 December 2026), so an
 * animal is taken to be as young as it might be.
 */
export function latestBirthDay(date: string): Date | undefined {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date);
  if (!match) return undefined;
  const [, year, month, day] = match.map(Number);
  if (match[3]) return new Date(Date.UTC(year!, month! - 1, day));
  if (match[2]) return new Date(Date.UTC(year!, month!, 0)); // the month's last day
  return new Date(Date.UTC(year!, 11, 31));
}

/** When a puppy or kitten becomes old enough to list; undefined if it already is, or isn't one. */
export function listableFrom(
  animal: { species: string; birth?: { date: string } },
  { minWeeks = DEFAULT_MIN_AGE_WEEKS, now = new Date() }: { minWeeks?: number; now?: Date } = {},
): Date | undefined {
  if (!MIN_AGE_SPECIES.includes(animal.species) || !animal.birth) return undefined;
  const born = latestBirthDay(animal.birth.date);
  if (!born) return undefined;
  const from = new Date(born.getTime() + minWeeks * 7 * DAY);
  return from > now ? from : undefined;
}

/**
 * Wording that suggests selling for profit, in the languages rescues most often write in.
 * A starting list, to be reviewed with experts.
 */
const SALE_PHRASES = [
  // English
  'for sale',
  'price',
  'priced',
  'buy',
  'purchase',
  'breeder',
  'breeding',
  'stud',
  'papers',
  'kc registered',
  'deposit',
  'ono',
  'or nearest offer',
  'negotiable',
  // Dutch, German, French and Spanish
  'te koop',
  'prijs',
  'fokker',
  'zu verkaufen',
  'preis',
  'züchter',
  'à vendre',
  'prix',
  'éleveur',
  'se vende',
  'precio',
  'criador',
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = SALE_PHRASES.map((phrase) => ({
  phrase,
  // Whole words only, so "buy" doesn't match "buoy" and "ono" doesn't match "monotone".
  pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase)}(?![\\p{L}\\p{N}])`, 'iu'),
}));

/** The sale phrases found in a listing's text, in list order, each once. */
export function saleWording(texts: ReadonlyArray<string | undefined>): string[] {
  const text = texts.filter(Boolean).join('\n');
  return PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ phrase }) => phrase);
}
