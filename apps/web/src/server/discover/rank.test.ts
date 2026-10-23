import { describe, expect, it } from 'vitest';
import { effectiveSort, rankResults } from './rank';

const results = [
  { id: 'near-conflict', match: 'conflicts' as const },
  { id: 'near-possible', match: 'possible' as const },
  { id: 'far-strong', match: 'strong' as const },
  { id: 'farther-possible', match: 'possible' as const },
];
const ids = (list: Array<{ id: string }>) => list.map((r) => r.id);

describe('rankResults', () => {
  it('puts strong matches first, keeping distance order within each level', () => {
    expect(ids(rankResults(results, { hideConflicts: false, byMatch: true }))).toEqual([
      'far-strong',
      'near-possible',
      'farther-possible',
      'near-conflict',
    ]);
  });

  it('can hide conflicts without reordering', () => {
    expect(ids(rankResults(results, { hideConflicts: true, byMatch: false }))).toEqual([
      'near-possible',
      'far-strong',
      'farther-possible',
    ]);
  });
});

describe('effectiveSort', () => {
  it('defaults to best match, else nearest, else newest', () => {
    expect(effectiveSort(undefined, { canMatch: true, hasOrigin: true })).toBe('match');
    expect(effectiveSort(undefined, { canMatch: false, hasOrigin: true })).toBe('nearest');
    expect(effectiveSort(undefined, { canMatch: false, hasOrigin: false })).toBe('newest');
  });

  it('honours a choice it can carry out', () => {
    expect(effectiveSort('newest', { canMatch: true, hasOrigin: true })).toBe('newest');
    expect(effectiveSort('nearest', { canMatch: true, hasOrigin: true })).toBe('nearest');
    expect(effectiveSort('nearest', { canMatch: true, hasOrigin: false })).toBe('match');
    expect(effectiveSort('match', { canMatch: false, hasOrigin: false })).toBe('newest');
  });
});
