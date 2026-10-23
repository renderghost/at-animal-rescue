import type { pet } from '@homeward/lexicons';
import { summarise, type CriterionLevel, type MatchState, type MatchSummary } from './summary';

export type Household = Partial<Omit<pet.homeward.adopter.household.Main, '$type'>>;
export type ListingCriterion = NonNullable<pet.homeward.listing.Main['criteria']>[number];

/** The criterion type without its NSID prefix, e.g. "childrenCriterion". */
export type CriterionKind = string;

export interface CriterionEvaluation {
  kind: CriterionKind;
  level: CriterionLevel;
  state: MatchState;
  /** The listing's requirement, as published (for explanations). */
  criterion: Record<string, unknown>;
  /** The adopter's answers that were compared (for explanations). Empty when unknown. */
  adopter: Record<string, unknown>;
}

export interface MatchInput {
  criteria?: readonly ListingCriterion[];
  household?: Household;
  /** Distance between the adopter and the animal, when both locations are known. */
  distanceKm?: number;
}

export interface MatchResult {
  summary: MatchSummary;
  criteria: CriterionEvaluation[];
}

const PREFIX = 'pet.homeward.listing#';
const EXPERIENCE_RANK: Record<string, number> = { none: 0, some: 1, experienced: 2 };

/** Unknown levels are treated as preferences (lexicon `level` description). */
function levelOf(criterion: { level?: unknown }): CriterionLevel {
  return criterion.level === 'required' ? 'required' : 'preferred';
}

function fromBoolean(value: boolean | undefined): MatchState {
  return value === undefined ? 'unknown' : value ? 'match' : 'conflict';
}

/**
 * Compares a listing's criteria with an adopter's household (spec §5). Pure and
 * deterministic: the same inputs always give the same, explainable result.
 *
 * The adoption fee is shown on the listing but not compared: adopters aren't asked for a
 * budget (spec §2, Adopter profile).
 */
export function evaluateMatch({
  criteria = [],
  household = {},
  distanceKm,
}: MatchInput): MatchResult {
  const evaluations = criteria.map((criterion) =>
    evaluateCriterion(criterion as Record<string, unknown>, household, distanceKm),
  );
  return { summary: summarise(evaluations), criteria: evaluations };
}

function evaluateCriterion(
  criterion: Record<string, unknown>,
  h: Household,
  distanceKm: number | undefined,
): CriterionEvaluation {
  const $type = typeof criterion.$type === 'string' ? criterion.$type : '';
  const kind = $type.startsWith(PREFIX) ? $type.slice(PREFIX.length) : $type;
  const { $type: _type, level: _level, ...requirement } = criterion;
  const result = (state: MatchState, adopter: Record<string, unknown> = {}) => ({
    kind,
    level: levelOf(criterion),
    state,
    criterion: requirement,
    adopter: state === 'unknown' ? {} : adopter,
  });

  switch (kind) {
    case 'childrenCriterion': {
      const { allowed, minAge } = criterion as pet.homeward.listing.ChildrenCriterion;
      if (!h.children) return result('unknown');
      const adopter = { children: h.children };
      if (!h.children.present) return result('match', adopter);
      if (!allowed) return result('conflict', adopter);
      if (minAge === undefined) return result('match', adopter);
      if (h.children.youngestAge === undefined) return result('unknown');
      return result(h.children.youngestAge >= minAge ? 'match' : 'conflict', adopter);
    }
    case 'otherAnimalsCriterion': {
      const { animal, allowed } = criterion as pet.homeward.listing.OtherAnimalsCriterion;
      if (!h.otherAnimals) return result('unknown');
      const present = h.otherAnimals.includes(animal);
      return result(present && !allowed ? 'conflict' : 'match', { otherAnimals: h.otherAnimals });
    }
    case 'experienceCriterion': {
      const { minimum } = criterion as pet.homeward.listing.ExperienceCriterion;
      const needed = EXPERIENCE_RANK[minimum];
      const has = h.experience === undefined ? undefined : EXPERIENCE_RANK[h.experience];
      if (needed === undefined || has === undefined) return result('unknown');
      return result(has >= needed ? 'match' : 'conflict', { experience: h.experience });
    }
    case 'homeTypeCriterion': {
      const { allowed } = criterion as pet.homeward.listing.HomeTypeCriterion;
      if (!h.homeType) return result('unknown');
      return result(allowed.includes(h.homeType) ? 'match' : 'conflict', { homeType: h.homeType });
    }
    case 'gardenCriterion': {
      const { secure } = criterion as pet.homeward.listing.GardenCriterion;
      if (!h.garden) return result('unknown');
      const adopter = { garden: h.garden };
      if (!h.garden.present) return result('conflict', adopter);
      if (!secure) return result('match', adopter);
      return h.garden.secure === undefined
        ? result('unknown')
        : result(h.garden.secure ? 'match' : 'conflict', adopter);
    }
    case 'settingCriterion': {
      const { allowed } = criterion as pet.homeward.listing.SettingCriterion;
      if (!h.setting) return result('unknown');
      return result(allowed.includes(h.setting) ? 'match' : 'conflict', { setting: h.setting });
    }
    case 'stepFreeCriterion':
      return result(fromBoolean(h.stepFree), { stepFree: h.stepFree });
    case 'landlordPermissionCriterion': {
      if (!h.tenure) return result('unknown');
      if (h.tenure === 'own') return result('match', { tenure: h.tenure });
      if (h.tenure !== 'rent') return result('unknown');
      return result(fromBoolean(h.landlordPermission), {
        tenure: h.tenure,
        landlordPermission: h.landlordPermission,
      });
    }
    case 'timeAloneCriterion': {
      const { maxHours } = criterion as pet.homeward.listing.TimeAloneCriterion;
      if (h.hoursAlone === undefined) return result('unknown');
      return result(h.hoursAlone <= maxHours ? 'match' : 'conflict', { hoursAlone: h.hoursAlone });
    }
    case 'medicalCareCriterion':
      return result(fromBoolean(h.willingMedicalCare), { willing: h.willingMedicalCare });
    case 'specialDietCriterion':
      return result(fromBoolean(h.willingSpecialDiet), { willing: h.willingSpecialDiet });
    case 'behaviouralSupportCriterion':
      return result(fromBoolean(h.willingBehaviouralSupport), {
        willing: h.willingBehaviouralSupport,
      });
    case 'distanceCriterion': {
      const { maxKm } = criterion as pet.homeward.listing.DistanceCriterion;
      if (distanceKm === undefined) return result('unknown');
      return result(distanceKm <= maxKm ? 'match' : 'conflict', {
        distanceKm: Math.round(distanceKm),
      });
    }
    case 'homeVisitCriterion':
      return result(fromBoolean(h.acceptsHomeVisit), { acceptsHomeVisit: h.acceptsHomeVisit });
    case 'multipleVisitsCriterion':
      return result(fromBoolean(h.canVisitSeveralTimes), {
        canVisitSeveralTimes: h.canVisitSeveralTimes,
      });
    default:
      // A criterion type this version doesn't know yet (open union): never guess.
      return result('unknown');
  }
}
