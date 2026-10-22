export type Role = 'organisation' | 'adopter';

/** What role detection needs, so it can be tested without a PDS or database. */
export interface RoleSources {
  /** Whether the account's repository has a pet.homeward.org.profile record. */
  hasOrganisationProfile(): Promise<boolean>;
  /** Whether Homeward's private store has an adopter household record for the account. */
  hasAdopterHousehold(): Promise<boolean>;
}

/**
 * The role is derived from which records exist, never stored separately (spec §2).
 * An organisation profile takes precedence: it is public and the stronger statement.
 */
export async function detectRole(sources: RoleSources): Promise<Role | undefined> {
  if (await sources.hasOrganisationProfile()) return 'organisation';
  if (await sources.hasAdopterHousehold()) return 'adopter';
  return undefined;
}
