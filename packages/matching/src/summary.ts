export type MatchState = 'match' | 'conflict' | 'unknown';
export type CriterionLevel = 'required' | 'preferred';
export type MatchSummary = 'strong' | 'possible' | 'conflicts';

export interface CriterionResult {
  state: MatchState;
  level: CriterionLevel;
}

/**
 * Rolls per-criterion results up into the summary badge (spec §5).
 * - Any required criterion in conflict → conflicts.
 * - Every required criterion matched, no preferred conflicts and at least one match → strong.
 * - Anything else (unknowns, preferred conflicts, nothing to compare) → possible.
 */
export function summarise(results: readonly CriterionResult[]): MatchSummary {
  const required = results.filter((r) => r.level === 'required');
  if (required.some((r) => r.state === 'conflict')) return 'conflicts';

  const allRequiredMatch = required.every((r) => r.state === 'match');
  const preferredConflict = results.some((r) => r.level === 'preferred' && r.state === 'conflict');
  const anyMatch = results.some((r) => r.state === 'match');
  return allRequiredMatch && !preferredConflict && anyMatch ? 'strong' : 'possible';
}
