import type { MatchSummary } from '@homeward/matching';

const RANK: Record<MatchSummary, number> = { strong: 0, possible: 1, conflicts: 2 };

/**
 * Orders results for an adopter (#39): optionally without conflicts, and by match first when
 * asked. Within a match level the incoming order (nearest or newest) is kept.
 */
export function rankResults<T extends { match: MatchSummary }>(
  results: readonly T[],
  { hideConflicts, byMatch }: { hideConflicts: boolean; byMatch: boolean },
): T[] {
  const kept = hideConflicts ? results.filter((r) => r.match !== 'conflicts') : [...results];
  // Array.prototype.sort is stable, so equal matches keep their order.
  return byMatch ? kept.sort((a, b) => RANK[a.match] - RANK[b.match]) : kept;
}

/** The sort actually used: what was asked for, if it can be done, else the best default. */
export function effectiveSort(
  asked: 'match' | 'nearest' | 'newest' | undefined,
  { canMatch, hasOrigin }: { canMatch: boolean; hasOrigin: boolean },
): 'match' | 'nearest' | 'newest' {
  if (asked === 'match' && canMatch) return 'match';
  if (asked === 'nearest' && hasOrigin) return 'nearest';
  if (asked === 'newest') return 'newest';
  return canMatch ? 'match' : hasOrigin ? 'nearest' : 'newest';
}
