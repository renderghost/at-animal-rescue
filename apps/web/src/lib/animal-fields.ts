/**
 * Limits of the pet.homeward.animal record, shared by the server-side parser and the editor
 * (kept free of dependencies for the browser bundle).
 */
export const ANIMAL_LIMITS = {
  name: 100,
  speciesDetail: 100,
  breed: 100,
  colours: 5,
  colour: 64,
  conditions: 20,
  condition: 100,
  medication: 1000,
  notes: 2000,
  traits: 20,
  story: 5000,
  registry: 100,
  passportNumber: 64,
} as const;

export const MAX_BREEDS = 3;

/** The radio value for "Not known": the field is left out, so readers treat it as unknown. */
export const YES_NO_UNKNOWN = { unknown: 'unknown' } as const;
