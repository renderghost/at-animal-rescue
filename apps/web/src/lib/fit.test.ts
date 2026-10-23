import { evaluateMatch, type Household, type ListingCriterion } from '@homeward/matching';
import { describe, expect, it } from 'vitest';
import { answerOf, listingPath, profileHref, unknownOf } from './fit';

const c = (type: string, fields: Record<string, unknown> = {}) =>
  ({ $type: `pet.homeward.listing#${type}`, level: 'required', ...fields }) as ListingCriterion;

function explain(criterion: ListingCriterion, household: Household, distanceKm?: number) {
  const [evaluation] = evaluateMatch({ criteria: [criterion], household, distanceKm }).criteria;
  return evaluation!.state === 'unknown'
    ? { state: 'unknown', unknown: unknownOf(evaluation!, household, distanceKm !== undefined) }
    : { state: evaluation!.state, answer: answerOf(evaluation!) };
}

describe('answerOf', () => {
  it('says what the adopter told us about children', () => {
    const adultsOnly = c('childrenCriterion', { allowed: false });
    expect(explain(adultsOnly, { children: { present: true, youngestAge: 7 } })).toEqual({
      state: 'conflict',
      answer: { key: 'childrenYoungest', values: { age: 7 } },
    });
    expect(explain(adultsOnly, { children: { present: true } })).toEqual({
      state: 'conflict',
      answer: { key: 'children' },
    });
    expect(explain(adultsOnly, { children: { present: false } })).toEqual({
      state: 'match',
      answer: { key: 'childrenNone' },
    });
  });

  it('lists other animals, or none', () => {
    const noCats = c('otherAnimalsCriterion', { animal: 'cat', allowed: false });
    expect(explain(noCats, { otherAnimals: ['dog', 'cat'] }).answer).toEqual({
      key: 'otherAnimals',
      animals: ['dog', 'cat'],
    });
    expect(explain(noCats, { otherAnimals: [] }).answer).toEqual({ key: 'otherAnimalsNone' });
  });

  it.each([
    [c('experienceCriterion', { minimum: 'some' }), { experience: 'none' }, 'experience.none'],
    [c('homeTypeCriterion', { allowed: ['house'] }), { homeType: 'flat' }, 'homeType.flat'],
    [c('settingCriterion', { allowed: ['rural'] }), { setting: 'urban' }, 'setting.urban'],
    [c('gardenCriterion'), { garden: { present: false } }, 'garden.none'],
    [c('gardenCriterion'), { garden: { present: true } }, 'garden.yes'],
    [
      c('gardenCriterion', { secure: true }),
      { garden: { present: true, secure: false } },
      'garden.notSecure',
    ],
    [
      c('gardenCriterion', { secure: true }),
      { garden: { present: true, secure: true } },
      'garden.secure',
    ],
    [c('stepFreeCriterion'), { stepFree: false }, 'stepFree.no'],
    [c('landlordPermissionCriterion'), { tenure: 'own' }, 'tenure.own'],
    [
      c('landlordPermissionCriterion'),
      { tenure: 'rent', landlordPermission: true },
      'tenure.rentAllowed',
    ],
    [
      c('landlordPermissionCriterion'),
      { tenure: 'rent', landlordPermission: false },
      'tenure.rentNotAllowed',
    ],
    [c('timeAloneCriterion', { maxHours: 4 }), { hoursAlone: 24 }, 'hoursAloneMore'],
    [c('medicalCareCriterion'), { willingMedicalCare: true }, 'medicalCare.yes'],
    [c('specialDietCriterion'), { willingSpecialDiet: false }, 'specialDiet.no'],
    [
      c('behaviouralSupportCriterion'),
      { willingBehaviouralSupport: true },
      'behaviouralSupport.yes',
    ],
    [c('homeVisitCriterion'), { acceptsHomeVisit: false }, 'homeVisit.no'],
    [c('multipleVisitsCriterion'), { canVisitSeveralTimes: true }, 'multipleVisits.yes'],
  ] as const)('%o with %o says %s', (criterion, household, key) => {
    expect(explain(criterion, household as Household).answer?.key).toBe(key);
  });

  it('gives hours alone and distance as numbers for the message', () => {
    expect(explain(c('timeAloneCriterion', { maxHours: 4 }), { hoursAlone: 2 }).answer).toEqual({
      key: 'hoursAlone',
      values: { hours: 2 },
    });
    expect(explain(c('distanceCriterion', { maxKm: 50 }), {}, 34.6).answer).toEqual({
      key: 'distance',
      values: { km: 35 },
    });
  });
});

describe('unknownOf', () => {
  it('points at the question that would settle it', () => {
    const over8 = c('childrenCriterion', { allowed: true, minAge: 8 });
    expect(explain(over8, {}).unknown).toEqual({ why: 'unanswered', question: 'children' });
    expect(explain(over8, { children: { present: true } }).unknown).toEqual({
      why: 'unanswered',
      question: 'youngestAge',
    });
    const secure = c('gardenCriterion', { secure: true });
    expect(explain(secure, {}).unknown).toMatchObject({ question: 'garden' });
    expect(explain(secure, { garden: { present: true } }).unknown).toMatchObject({
      question: 'gardenSecure',
    });
    const landlord = c('landlordPermissionCriterion');
    expect(explain(landlord, {}).unknown).toMatchObject({ question: 'tenure' });
    expect(explain(landlord, { tenure: 'rent' }).unknown).toMatchObject({
      question: 'landlordPermission',
    });
    expect(explain(c('timeAloneCriterion', { maxHours: 4 }), {}).unknown).toMatchObject({
      question: 'hoursAlone',
    });
  });

  it('tells a missing home location from a listing without one', () => {
    const near = c('distanceCriterion', { maxKm: 50 });
    const [evaluation] = evaluateMatch({ criteria: [near], household: {} }).criteria;
    expect(unknownOf(evaluation!, {}, false)).toEqual({ why: 'noLocation', question: 'location' });
    expect(unknownOf(evaluation!, {}, true)).toEqual({ why: 'noListingLocation' });
  });

  it('never guesses at what this version doesn’t understand', () => {
    expect(explain(c('futureCriterion'), {}).unknown).toEqual({ why: 'unsupported' });
    const guru = c('experienceCriterion', { minimum: 'guru' });
    expect(explain(guru, { experience: 'some' }).unknown).toEqual({ why: 'unsupported' });
    expect(explain(guru, {}).unknown).toMatchObject({ question: 'experience' });
  });
});

describe('listingPath', () => {
  it('accepts only a listing page on this site', () => {
    expect(listingPath('/org/hillfarm.example/listings/3m5z2kq5qns2l')).toEqual({
      path: '/org/hillfarm.example/listings/3m5z2kq5qns2l',
      org: 'hillfarm.example',
      rkey: '3m5z2kq5qns2l',
    });
    expect(listingPath('/org/did%3Aplc%3Ahill/listings/3m5z2kq5qns2l')?.org).toBe('did:plc:hill');
    for (const bad of [
      undefined,
      '',
      'https://evil.example/org/x/listings/3m5z2kq5qns2l',
      '//evil.example/org/x/listings/3m5z2kq5qns2l',
      '/org/x/listings/3m5z2kq5qns2l?next=//evil',
      '/org/x/listings/3m5z2kq5qns2l/../../../evil',
      '/org/a\\b/listings/3m5z2kq5qns2l',
      '/org/x/listings/NOTATID',
      '/org/%E0%A4%A/listings/3m5z2kq5qns2l',
      '/discover',
    ]) {
      expect(listingPath(bad), String(bad)).toBeUndefined();
    }
  });

  it('builds profile links that come back', () => {
    expect(profileHref('garden', '/org/x/listings/3m5z2kq5qns2l')).toBe(
      '/adopter/profile?from=%2Forg%2Fx%2Flistings%2F3m5z2kq5qns2l#garden',
    );
    expect(profileHref()).toBe('/adopter/profile');
  });
});
