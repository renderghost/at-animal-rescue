import { describe, expect, it } from 'vitest';
import { evaluateMatch, type Household, type ListingCriterion } from './evaluate';

const c = (type: string, fields: Record<string, unknown>) =>
  ({ $type: `pet.homeward.listing#${type}`, level: 'required', ...fields }) as ListingCriterion;

function stateOf(criterion: ListingCriterion, household: Household, distanceKm?: number) {
  const { criteria } = evaluateMatch({ criteria: [criterion], household, distanceKm });
  return criteria[0]!.state;
}

describe('childrenCriterion', () => {
  const adultsOnly = c('childrenCriterion', { allowed: false });
  const over8 = c('childrenCriterion', { allowed: true, minAge: 8 });

  it.each([
    [adultsOnly, {}, 'unknown'],
    [adultsOnly, { children: { present: false } }, 'match'],
    [adultsOnly, { children: { present: true, youngestAge: 12 } }, 'conflict'],
    [over8, { children: { present: true, youngestAge: 8 } }, 'match'],
    [over8, { children: { present: true, youngestAge: 7 } }, 'conflict'],
    [over8, { children: { present: true } }, 'unknown'],
    [c('childrenCriterion', { allowed: true }), { children: { present: true } }, 'match'],
  ] as const)('%o with %o is %s', (criterion, household, expected) => {
    expect(stateOf(criterion, household)).toBe(expected);
  });
});

describe('otherAnimalsCriterion', () => {
  const noCats = c('otherAnimalsCriterion', { animal: 'cat', allowed: false });
  it('conflicts only when that animal is in the home', () => {
    expect(stateOf(noCats, { otherAnimals: ['cat', 'dog'] })).toBe('conflict');
    expect(stateOf(noCats, { otherAnimals: ['dog'] })).toBe('match');
    expect(stateOf(noCats, { otherAnimals: [] })).toBe('match');
    expect(stateOf(noCats, {})).toBe('unknown');
  });
});

describe('experienceCriterion', () => {
  const experienced = c('experienceCriterion', { minimum: 'experienced' });
  it('compares levels', () => {
    expect(stateOf(experienced, { experience: 'experienced' })).toBe('match');
    expect(stateOf(experienced, { experience: 'some' })).toBe('conflict');
    expect(stateOf(c('experienceCriterion', { minimum: 'none' }), { experience: 'none' })).toBe(
      'match',
    );
    expect(stateOf(experienced, {})).toBe('unknown');
    expect(stateOf(c('experienceCriterion', { minimum: 'guru' }), { experience: 'some' })).toBe(
      'unknown',
    );
  });
});

describe('home criteria', () => {
  it('home type and setting must be in the allowed list', () => {
    const houseOnly = c('homeTypeCriterion', { allowed: ['house'] });
    expect(stateOf(houseOnly, { homeType: 'house' })).toBe('match');
    expect(stateOf(houseOnly, { homeType: 'flat' })).toBe('conflict');
    expect(stateOf(houseOnly, {})).toBe('unknown');
    const notUrban = c('settingCriterion', { allowed: ['suburban', 'rural'] });
    expect(stateOf(notUrban, { setting: 'urban' })).toBe('conflict');
  });

  it('garden: presence, then security when required', () => {
    const secure = c('gardenCriterion', { secure: true });
    expect(stateOf(secure, { garden: { present: false } })).toBe('conflict');
    expect(stateOf(secure, { garden: { present: true, secure: true } })).toBe('match');
    expect(stateOf(secure, { garden: { present: true, secure: false } })).toBe('conflict');
    expect(stateOf(secure, { garden: { present: true } })).toBe('unknown');
    expect(stateOf(c('gardenCriterion', {}), { garden: { present: true } })).toBe('match');
  });

  it('landlord permission only matters for renters', () => {
    const permission = c('landlordPermissionCriterion', {});
    expect(stateOf(permission, { tenure: 'own' })).toBe('match');
    expect(stateOf(permission, { tenure: 'rent', landlordPermission: true })).toBe('match');
    expect(stateOf(permission, { tenure: 'rent', landlordPermission: false })).toBe('conflict');
    expect(stateOf(permission, { tenure: 'rent' })).toBe('unknown');
    expect(stateOf(permission, {})).toBe('unknown');
  });

  it('step-free', () => {
    const stepFree = c('stepFreeCriterion', {});
    expect(stateOf(stepFree, { stepFree: true })).toBe('match');
    expect(stateOf(stepFree, { stepFree: false })).toBe('conflict');
  });
});

describe('care criteria', () => {
  it('time alone is a maximum', () => {
    const sixHours = c('timeAloneCriterion', { maxHours: 6 });
    expect(stateOf(sixHours, { hoursAlone: 6 })).toBe('match');
    expect(stateOf(sixHours, { hoursAlone: 8 })).toBe('conflict');
    expect(stateOf(sixHours, {})).toBe('unknown');
  });

  it.each([
    ['medicalCareCriterion', 'willingMedicalCare'],
    ['specialDietCriterion', 'willingSpecialDiet'],
    ['behaviouralSupportCriterion', 'willingBehaviouralSupport'],
  ])('%s follows %s', (type, field) => {
    expect(stateOf(c(type, {}), { [field]: true })).toBe('match');
    expect(stateOf(c(type, {}), { [field]: false })).toBe('conflict');
    expect(stateOf(c(type, {}), {})).toBe('unknown');
  });
});

describe('logistics criteria', () => {
  it('distance needs both locations', () => {
    const near = c('distanceCriterion', { maxKm: 50 });
    expect(stateOf(near, {}, 49.6)).toBe('match');
    expect(stateOf(near, {}, 51)).toBe('conflict');
    expect(stateOf(near, {})).toBe('unknown');
  });

  it('visits follow the adopter’s answers', () => {
    expect(stateOf(c('homeVisitCriterion', {}), { acceptsHomeVisit: true })).toBe('match');
    expect(stateOf(c('multipleVisitsCriterion', {}), { canVisitSeveralTimes: false })).toBe(
      'conflict',
    );
  });
});

describe('adoption fee', () => {
  const household: Household = { maxFee: { amount: 10000, currency: 'EUR' } };

  it('a fixed fee over budget is a required conflict', () => {
    const { criteria, summary } = evaluateMatch({
      adoptionFee: { kind: 'fee', amount: { amount: 15000, currency: 'EUR' } },
      household,
    });
    expect(criteria).toEqual([
      expect.objectContaining({ kind: 'fee', level: 'required', state: 'conflict' }),
    ]);
    expect(summary).toBe('conflicts');
  });

  it('a suggested donation over budget is only a preference', () => {
    const { criteria } = evaluateMatch({
      adoptionFee: { kind: 'donation', amount: { amount: 15000, currency: 'EUR' } },
      household,
    });
    expect(criteria[0]).toMatchObject({ level: 'preferred', state: 'conflict' });
  });

  it('does not convert currencies', () => {
    const { criteria } = evaluateMatch({
      adoptionFee: { kind: 'fee', amount: { amount: 5000, currency: 'GBP' } },
      household,
    });
    expect(criteria[0]!.state).toBe('unknown');
  });

  it('adds no check when there is no fee', () => {
    expect(evaluateMatch({ adoptionFee: { kind: 'none' }, household }).criteria).toEqual([]);
  });
});

describe('evaluateMatch', () => {
  it('treats unknown levels as preferred and unknown criterion types as unknown', () => {
    const { criteria } = evaluateMatch({
      criteria: [c('futureCriterion', { level: 'essential' })],
      household: {},
    });
    expect(criteria[0]).toMatchObject({
      kind: 'futureCriterion',
      level: 'preferred',
      state: 'unknown',
    });
  });

  it('explains each result with the requirement and the adopter’s answer', () => {
    const { criteria } = evaluateMatch({
      criteria: [c('childrenCriterion', { allowed: false })],
      household: { children: { present: true, youngestAge: 7 } },
    });
    expect(criteria[0]).toEqual({
      kind: 'childrenCriterion',
      level: 'required',
      state: 'conflict',
      criterion: { allowed: false },
      adopter: { children: { present: true, youngestAge: 7 } },
    });
  });

  it('never exposes adopter data for unknown results', () => {
    const { criteria } = evaluateMatch({
      criteria: [c('childrenCriterion', { allowed: true, minAge: 8 })],
      household: { children: { present: true } },
    });
    expect(criteria[0]!.adopter).toEqual({});
  });

  it('summarises a realistic listing', () => {
    const result = evaluateMatch({
      criteria: [
        c('childrenCriterion', { allowed: true, minAge: 8 }),
        c('gardenCriterion', { secure: true }),
        { ...c('timeAloneCriterion', { maxHours: 4 }), level: 'preferred' } as ListingCriterion,
      ],
      household: {
        children: { present: true, youngestAge: 10 },
        garden: { present: true, secure: true },
        hoursAlone: 6,
      },
    });
    expect(result.criteria.map((r) => r.state)).toEqual(['match', 'match', 'conflict']);
    expect(result.summary).toBe('possible');
  });
});
