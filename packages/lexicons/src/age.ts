import type { Species } from './taxonomy';

export type AgeGroup = 'young' | 'adult' | 'senior';

/**
 * Per-species thresholds in years: young below `youngUnder`, senior from `seniorFrom`.
 * Product decision (spec §2). The values are starting points from common welfare guidance
 * (e.g. International Cat Care's life stages for cats) and need a rescue or vet check (#11).
 */
export const AGE_THRESHOLDS: Record<
  Exclude<Species, 'other'>,
  { youngUnder: number; seniorFrom: number }
> = {
  dog: { youngUnder: 2, seniorFrom: 8 },
  cat: { youngUnder: 2, seniorFrom: 11 },
  rabbit: { youngUnder: 1, seniorFrom: 5 },
  guineaPig: { youngUnder: 1, seniorFrom: 5 },
  chinchilla: { youngUnder: 1, seniorFrom: 10 },
  degu: { youngUnder: 1, seniorFrom: 5 },
  ferret: { youngUnder: 1, seniorFrom: 5 },
  rat: { youngUnder: 0.5, seniorFrom: 2 },
  hamster: { youngUnder: 0.5, seniorFrom: 1.5 },
  gerbil: { youngUnder: 0.5, seniorFrom: 2.5 },
  mouse: { youngUnder: 0.5, seniorFrom: 1.5 },
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Parses a lexicon birth date (YYYY, YYYY-MM or YYYY-MM-DD). Partial dates use the
 * middle of the period, so an estimate is never more than half a year out.
 */
export function parseBirthDate(value: string | undefined): Date | undefined {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value ?? '');
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(Number(year), month ? Number(month) - 1 : 6, day ? Number(day) : month ? 15 : 1),
  );
  // Reject impossible dates such as 2026-02-31, which Date would roll over.
  if (day && date.getUTCDate() !== Number(day)) return undefined;
  if (month && (Number(month) < 1 || Number(month) > 12)) return undefined;
  return date;
}

/** The animal's age group, or undefined when the species has no thresholds or the date is unusable. */
export function ageGroupOf(
  species: string,
  birthDate: string | undefined,
  now: Date = new Date(),
): AgeGroup | undefined {
  const thresholds = AGE_THRESHOLDS[species as keyof typeof AGE_THRESHOLDS];
  const born = parseBirthDate(birthDate);
  if (!thresholds || !born || born > now) return undefined;
  const years = (now.getTime() - born.getTime()) / MS_PER_YEAR;
  if (years < thresholds.youngUnder) return 'young';
  if (years >= thresholds.seniorFrom) return 'senior';
  return 'adult';
}

/**
 * The birth-date window for an age group, for search filters: born strictly after `after`
 * and on or before `before` (either may be open).
 */
export function birthDateRange(
  species: string,
  group: AgeGroup,
  now: Date = new Date(),
): { after?: Date; before?: Date } | undefined {
  const thresholds = AGE_THRESHOLDS[species as keyof typeof AGE_THRESHOLDS];
  if (!thresholds) return undefined;
  const yearsAgo = (years: number) => new Date(now.getTime() - years * MS_PER_YEAR);
  switch (group) {
    case 'young':
      return { after: yearsAgo(thresholds.youngUnder), before: now };
    case 'adult':
      return { after: yearsAgo(thresholds.seniorFrom), before: yearsAgo(thresholds.youngUnder) };
    case 'senior':
      return { before: yearsAgo(thresholds.seniorFrom) };
  }
}
