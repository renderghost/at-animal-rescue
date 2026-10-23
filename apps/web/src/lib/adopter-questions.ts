/**
 * The adopter profile's questions and limits, shared by the server-side parser and the
 * form (kept free of dependencies for the browser bundle).
 */

/** The radio value for "Prefer not to say": the answer is left out, so matching shows Unknown. */
export const UNANSWERED = 'unanswered';

/**
 * Hours alone are asked in bands and stored as each band's upper limit, so a listing's
 * maximum is never wrongly met (spec §2, Adopter profile).
 */
export const HOURS_ALONE_BANDS = [2, 4, 6, 8, 24] as const;
export const OTHER_ANIMALS = ['dog', 'cat', 'smallAnimal'] as const;
export const MAX_ABOUT = 1000;
export const MAX_PLACE = 100;

/** Yes/no questions and the household field each one answers. */
export const YES_NO = {
  stepFree: 'stepFree',
  willingMedicalCare: 'willingMedicalCare',
  willingSpecialDiet: 'willingSpecialDiet',
  willingBehaviouralSupport: 'willingBehaviouralSupport',
  acceptsHomeVisit: 'acceptsHomeVisit',
  canVisitSeveralTimes: 'canVisitSeveralTimes',
} as const;

/** Questions with a fixed set of answers, stored as given. */
export const CHOICES = {
  experience: ['none', 'some', 'experienced'],
  homeType: ['flat', 'house'],
  setting: ['urban', 'suburban', 'rural'],
  tenure: ['own', 'rent'],
} as const;
