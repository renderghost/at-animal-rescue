import { describe, expect, it } from 'vitest';
import { summarise } from './index';

describe('summarise', () => {
  it('is conflicts when a required criterion conflicts', () => {
    expect(
      summarise([
        { level: 'required', state: 'conflict' },
        { level: 'preferred', state: 'match' },
      ]),
    ).toBe('conflicts');
  });

  it('is strong when every required criterion matches and nothing preferred conflicts', () => {
    expect(
      summarise([
        { level: 'required', state: 'match' },
        { level: 'preferred', state: 'unknown' },
      ]),
    ).toBe('strong');
  });

  it('is possible when a required criterion is unknown', () => {
    expect(
      summarise([
        { level: 'required', state: 'match' },
        { level: 'required', state: 'unknown' },
      ]),
    ).toBe('possible');
  });

  it('is possible when only a preferred criterion conflicts', () => {
    expect(
      summarise([
        { level: 'required', state: 'match' },
        { level: 'preferred', state: 'conflict' },
      ]),
    ).toBe('possible');
  });

  it('is possible when there is nothing to compare', () => {
    expect(summarise([])).toBe('possible');
    expect(summarise([{ level: 'preferred', state: 'unknown' }])).toBe('possible');
  });
});
