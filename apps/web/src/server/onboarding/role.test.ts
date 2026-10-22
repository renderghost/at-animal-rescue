import { describe, expect, it } from 'vitest';
import { detectRole } from './role';

const sources = (org: boolean, adopter: boolean) => ({
  hasOrganisationProfile: async () => org,
  hasAdopterHousehold: async () => adopter,
});

describe('detectRole', () => {
  it('derives the role from which records exist', async () => {
    expect(await detectRole(sources(true, false))).toBe('organisation');
    expect(await detectRole(sources(false, true))).toBe('adopter');
    expect(await detectRole(sources(false, false))).toBeUndefined();
  });

  it('prefers the organisation role when both records exist', async () => {
    expect(await detectRole(sources(true, true))).toBe('organisation');
  });
});
