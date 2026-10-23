import type { CriterionEvaluation, Household } from '@homeward/matching';

/**
 * How a listing's criteria fit an adopter, in words (#40): what they told us for each
 * criterion that could be checked, and, for one that couldn't, why not and which profile
 * question would settle it. Pure, so it can be tested without a page.
 */

/** Adopter profile questions a "not enough information" row can link to (anchors on the form). */
export type ProfileQuestion =
  | 'children'
  | 'youngestAge'
  | 'otherAnimals'
  | 'experience'
  | 'homeType'
  | 'garden'
  | 'gardenSecure'
  | 'setting'
  | 'stepFree'
  | 'tenure'
  | 'landlordPermission'
  | 'hoursAlone'
  | 'willingMedicalCare'
  | 'willingSpecialDiet'
  | 'willingBehaviouralSupport'
  | 'acceptsHomeVisit'
  | 'canVisitSeveralTimes'
  | 'location';

/** What the adopter told us: a message under `Fit.answer`, with its values. */
export interface Answer {
  key: string;
  values?: Record<string, number>;
  /** The other animals in their home, listed in the message. */
  animals?: string[];
}

/** Why a criterion couldn't be checked, and the question that would settle it. */
export type Unknown =
  | { why: 'unanswered'; question: ProfileQuestion }
  | { why: 'noLocation'; question: 'location' }
  | { why: 'noListingLocation' }
  | { why: 'unsupported' };

const KNOWN_EXPERIENCE = ['none', 'some', 'experienced'];
const yesNo = (value: unknown) => (value ? 'yes' : 'no');

/** The adopter's answer behind a match or conflict, e.g. "children, the youngest aged 7". */
export function answerOf({ kind, adopter: a }: CriterionEvaluation): Answer | undefined {
  switch (kind) {
    case 'childrenCriterion': {
      const children = a.children as Household['children'];
      if (!children) return undefined;
      if (!children.present) return { key: 'childrenNone' };
      return children.youngestAge === undefined
        ? { key: 'children' }
        : { key: 'childrenYoungest', values: { age: children.youngestAge } };
    }
    case 'otherAnimalsCriterion': {
      const animals = a.otherAnimals as string[] | undefined;
      if (!animals) return undefined;
      return animals.length === 0 ? { key: 'otherAnimalsNone' } : { key: 'otherAnimals', animals };
    }
    case 'experienceCriterion':
      return { key: `experience.${String(a.experience)}` };
    case 'homeTypeCriterion':
      return { key: `homeType.${String(a.homeType)}` };
    case 'settingCriterion':
      return { key: `setting.${String(a.setting)}` };
    case 'gardenCriterion': {
      const garden = a.garden as Household['garden'];
      if (!garden) return undefined;
      if (!garden.present) return { key: 'garden.none' };
      if (garden.secure === undefined) return { key: 'garden.yes' };
      return { key: garden.secure ? 'garden.secure' : 'garden.notSecure' };
    }
    case 'stepFreeCriterion':
      return { key: `stepFree.${yesNo(a.stepFree)}` };
    case 'landlordPermissionCriterion':
      if (a.tenure === 'own') return { key: 'tenure.own' };
      return { key: a.landlordPermission ? 'tenure.rentAllowed' : 'tenure.rentNotAllowed' };
    case 'timeAloneCriterion': {
      const hours = Number(a.hoursAlone);
      // Stored as the band's upper limit; the top band means "more than 8 hours".
      return hours > 8 ? { key: 'hoursAloneMore' } : { key: 'hoursAlone', values: { hours } };
    }
    case 'medicalCareCriterion':
      return { key: `medicalCare.${yesNo(a.willing)}` };
    case 'specialDietCriterion':
      return { key: `specialDiet.${yesNo(a.willing)}` };
    case 'behaviouralSupportCriterion':
      return { key: `behaviouralSupport.${yesNo(a.willing)}` };
    case 'distanceCriterion':
      return { key: 'distance', values: { km: Number(a.distanceKm) } };
    case 'homeVisitCriterion':
      return { key: `homeVisit.${yesNo(a.acceptsHomeVisit)}` };
    case 'multipleVisitsCriterion':
      return { key: `multipleVisits.${yesNo(a.canVisitSeveralTimes)}` };
    default:
      return undefined;
  }
}

/** Why a criterion is "not enough information", given the adopter's answers. */
export function unknownOf(
  { kind }: CriterionEvaluation,
  household: Household,
  hasLocation: boolean,
): Unknown {
  const ask = (question: ProfileQuestion): Unknown => ({ why: 'unanswered', question });
  switch (kind) {
    case 'childrenCriterion':
      // Children are there, but the listing has a minimum age and we don't know theirs.
      return ask(household.children ? 'youngestAge' : 'children');
    case 'otherAnimalsCriterion':
      return ask('otherAnimals');
    case 'experienceCriterion':
      // A known answer that still can't be compared means the listing asks for a level
      // this version doesn't know.
      return KNOWN_EXPERIENCE.includes(household.experience ?? '')
        ? { why: 'unsupported' }
        : ask('experience');
    case 'homeTypeCriterion':
      return ask('homeType');
    case 'gardenCriterion':
      return ask(household.garden ? 'gardenSecure' : 'garden');
    case 'settingCriterion':
      return ask('setting');
    case 'stepFreeCriterion':
      return ask('stepFree');
    case 'landlordPermissionCriterion':
      return ask(household.tenure === 'rent' ? 'landlordPermission' : 'tenure');
    case 'timeAloneCriterion':
      return ask('hoursAlone');
    case 'medicalCareCriterion':
      return ask('willingMedicalCare');
    case 'specialDietCriterion':
      return ask('willingSpecialDiet');
    case 'behaviouralSupportCriterion':
      return ask('willingBehaviouralSupport');
    case 'distanceCriterion':
      return hasLocation
        ? { why: 'noListingLocation' }
        : { why: 'noLocation', question: 'location' };
    case 'homeVisitCriterion':
      return ask('acceptsHomeVisit');
    case 'multipleVisitsCriterion':
      return ask('canVisitSeveralTimes');
    default:
      return { why: 'unsupported' };
  }
}

const LISTING_PATH = /^\/org\/([^/?#\\\s]+)\/listings\/([a-z2-7]{13})$/;

/**
 * A listing page path to come back to from the adopter profile, or undefined unless it's
 * exactly that shape (so the link can never lead off the site).
 */
export function listingPath(
  from: string | undefined,
): { path: string; org: string; rkey: string } | undefined {
  const match = from?.match(LISTING_PATH);
  if (!match) return undefined;
  try {
    return { path: from!, org: decodeURIComponent(match[1]!), rkey: match[2]! };
  } catch {
    return undefined; // malformed escape
  }
}

/** The adopter profile, opened at a question, with the listing to come back to. */
export function profileHref(question?: ProfileQuestion, back?: string): string {
  const query = back ? `?from=${encodeURIComponent(back)}` : '';
  return `/adopter/profile${query}${question ? `#${question}` : ''}`;
}
