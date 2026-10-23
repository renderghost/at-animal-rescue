import { toDatetimeString } from '@atproto/syntax';
import { pet } from '@homeward/lexicons';
import { describe, expect, it } from 'vitest';
import { UNANSWERED } from '@/lib/adopter-questions';
import { mergeHousehold, parseAdopterForm, toFormValues } from './adopter-form';

const now = new Date('2026-10-23T09:00:00.000Z');
const stamp = toDatetimeString(now);
const later = toDatetimeString(new Date('2026-10-24T09:00:00.000Z'));

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const full = {
  children: 'yes',
  youngestAge: '7',
  otherAnimals: 'some',
  'otherAnimal.cat': 'on',
  experience: 'some',
  homeType: 'house',
  garden: 'yes',
  gardenSecure: 'no',
  setting: 'suburban',
  stepFree: 'no',
  tenure: 'rent',
  landlordPermission: 'yes',
  hoursAlone: '4',
  willingMedicalCare: 'yes',
  willingSpecialDiet: UNANSWERED,
  willingBehaviouralSupport: 'no',
  acceptsHomeVisit: 'yes',
  canVisitSeveralTimes: 'yes',
  location: ' Utrecht ',
  country: 'nl',
};

describe('parseAdopterForm', () => {
  it('stores only the answers given, as a valid household record', () => {
    const result = parseAdopterForm(form(full), { now });
    expect(result.ok).toBe(true);
    expect(result.household).toEqual({
      children: { present: true, youngestAge: 7 },
      otherAnimals: ['cat'],
      experience: 'some',
      homeType: 'house',
      garden: { present: true, secure: false },
      setting: 'suburban',
      stepFree: false,
      tenure: 'rent',
      landlordPermission: true,
      hoursAlone: 4,
      willingMedicalCare: true,
      willingBehaviouralSupport: false,
      acceptsHomeVisit: true,
      canVisitSeveralTimes: true,
      updatedAt: '2026-10-23T09:00:00.000Z',
    });
    expect(
      pet.homeward.adopter.household.$safeParse({
        $type: 'pet.homeward.adopter.household',
        ...result.household,
      }).success,
    ).toBe(true);
    expect(result.place).toEqual({ text: 'Utrecht', country: 'NL' });
    expect(result.publish).toBe(false);
  });

  it('leaves out everything marked "Prefer not to say"', () => {
    const answers = Object.fromEntries(Object.keys(full).map((key) => [key, UNANSWERED]));
    const result = parseAdopterForm(form({ ...answers, youngestAge: '', location: '' }), { now });
    expect(result.household).toEqual({ updatedAt: '2026-10-23T09:00:00.000Z' });
    expect(result.place).toBeUndefined();
  });

  it('distinguishes no other animals from not saying', () => {
    expect(parseAdopterForm(form({ otherAnimals: 'none' })).household.otherAnimals).toEqual([]);
    expect(parseAdopterForm(form({ otherAnimals: UNANSWERED })).household).not.toHaveProperty(
      'otherAnimals',
    );
  });

  it('ignores follow-up answers that no longer apply', () => {
    const { household } = parseAdopterForm(
      form({ ...full, children: 'no', garden: 'no', tenure: 'own' }),
    );
    expect(household.children).toEqual({ present: false });
    expect(household.garden).toEqual({ present: false });
    expect(household).not.toHaveProperty('landlordPermission');
  });

  it('reports what needs fixing', () => {
    const result = parseAdopterForm(
      form({
        children: 'yes',
        youngestAge: '19',
        otherAnimals: 'some',
        location: 'Utrecht',
        country: '',
        about: 'x'.repeat(1001),
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      errors: {
        youngestAge: 'invalid',
        otherAnimals: 'required',
        country: 'required',
        about: 'tooLong',
      },
    });
  });

  it('reads the public profile choices', () => {
    const result = parseAdopterForm(
      form({
        publish: 'on',
        'species.cat': 'on',
        'species.rabbit': 'on',
        'size.small': 'on',
        'ageGroup.senior': 'on',
        about: 'Quiet home, lots of sunny windowsills.',
      }),
    );
    expect(result).toMatchObject({
      publish: true,
      seeking: { species: ['cat', 'rabbit'], sizes: ['small'], ageGroups: ['senior'] },
      about: 'Quiet home, lots of sunny windowsills.',
    });
  });
});

describe('toFormValues', () => {
  it('round-trips through the form', () => {
    const first = parseAdopterForm(form(full), { now });
    const values = toFormValues({
      household: first.household,
      location: {
        label: 'Utrecht',
        country: 'NL',
        latitude: '52.09',
        longitude: '5.12',
        updatedAt: stamp,
      },
    });
    expect(parseAdopterForm(form(values), { now }).household).toEqual(first.household);
    expect(values).toMatchObject({
      location: 'Utrecht',
      country: 'NL',
      willingSpecialDiet: UNANSWERED,
    });
  });

  it('shows hours stored by another client in the band they fall in', () => {
    expect(toFormValues({ household: { hoursAlone: 5 } }).hoursAlone).toBe('6');
    expect(toFormValues({ household: { hoursAlone: 12 } }).hoursAlone).toBe('24');
  });
});

describe('mergeHousehold', () => {
  it('keeps fields this form does not edit', () => {
    const existing = { maxFee: { amount: 5000, currency: 'EUR' }, hoursAlone: 8, updatedAt: stamp };
    expect(mergeHousehold(existing, { updatedAt: later })).toEqual({
      maxFee: { amount: 5000, currency: 'EUR' },
      updatedAt: later,
    });
  });
});
