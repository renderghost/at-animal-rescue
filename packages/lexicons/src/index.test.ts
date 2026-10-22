import { describe, expect, it } from 'vitest';
import { pet } from './index';

const createdAt = '2026-10-22T12:00:00.000Z';
const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz';

const orgProfile = {
  $type: 'pet.homeward.org.profile',
  displayName: 'Hill Farm Animal Rescue',
  location: {
    locality: 'Utrecht',
    region: 'Utrecht',
    country: 'NL',
    latitude: '52.09',
    longitude: '5.12',
  },
  contact: { preferred: 'email', email: 'adopt@hillfarm.example' },
  donationLinks: [
    { label: 'Monthly gift', url: 'https://hillfarm.example/give', kind: 'recurring' },
  ],
  charityRegistration: { registry: 'ANBI register', number: '123456789' },
  createdAt,
};

const animal = {
  $type: 'pet.homeward.animal',
  name: 'Bonnie',
  species: 'rabbit',
  sex: 'female',
  birth: { date: '2023-04', estimated: true },
  neutered: true,
  traits: ['affectionate', 'curious'],
  createdAt,
};

const bondedListing = {
  $type: 'pet.homeward.listing',
  animals: [
    `at://${did}/pet.homeward.animal/3l2s5xxv3gk2a`,
    `at://${did}/pet.homeward.animal/3l2s5xxv3gk2b`,
  ],
  bonded: true,
  title: 'Bonnie and Clyde',
  status: 'available',
  criteria: [
    {
      $type: 'pet.homeward.listing#childrenCriterion',
      level: 'required',
      allowed: true,
      minAge: 8,
    },
    {
      $type: 'pet.homeward.listing#otherAnimalsCriterion',
      level: 'preferred',
      animal: 'dog',
      allowed: false,
    },
    { $type: 'pet.homeward.listing#gardenCriterion', level: 'required', secure: true },
    { $type: 'pet.homeward.listing#timeAloneCriterion', level: 'preferred', maxHours: 6 },
  ],
  adoptionFee: { kind: 'donation', amount: { amount: 7500, currency: 'EUR' } },
  createdAt,
};

const adopterProfile = {
  $type: 'pet.homeward.adopter.profile',
  seeking: { species: ['rabbit', 'guineaPig'], ageGroups: ['adult', 'senior'] },
  area: { country: 'NL', region: 'Utrecht' },
  createdAt,
};

describe('public lexicons', () => {
  it('accept valid records', () => {
    expect(pet.homeward.org.profile.$safeParse(orgProfile).success).toBe(true);
    expect(pet.homeward.animal.$safeParse(animal).success).toBe(true);
    expect(pet.homeward.listing.$safeParse(bondedListing).success).toBe(true);
    expect(pet.homeward.adopter.profile.$safeParse(adopterProfile).success).toBe(true);
  });

  it('reject a listing without animals', () => {
    expect(pet.homeward.listing.$safeParse({ ...bondedListing, animals: [] }).success).toBe(false);
  });

  it('reject a listing whose animal reference is not an AT URI', () => {
    const result = pet.homeward.listing.$safeParse({
      ...bondedListing,
      animals: ['https://example.com/bonnie'],
    });
    expect(result.success).toBe(false);
  });

  it('reject a criterion without a level', () => {
    const result = pet.homeward.listing.$safeParse({
      ...bondedListing,
      criteria: [{ $type: 'pet.homeward.listing#stepFreeCriterion' }],
    });
    expect(result.success).toBe(false);
  });

  it('accept criterion types it does not know yet (open union)', () => {
    const result = pet.homeward.listing.$safeParse({
      ...bondedListing,
      criteria: [{ $type: 'pet.homeward.listing#futureCriterion', level: 'preferred' }],
    });
    expect(result.success).toBe(true);
  });

  it('reject a country that is not a two-letter code', () => {
    const result = pet.homeward.org.profile.$safeParse({
      ...orgProfile,
      location: { ...orgProfile.location, country: 'NLD' },
    });
    expect(result.success).toBe(false);
  });

  it('reject an adoption fee amount below zero', () => {
    const result = pet.homeward.listing.$safeParse({
      ...bondedListing,
      adoptionFee: { kind: 'fee', amount: { amount: -1, currency: 'GBP' } },
    });
    expect(result.success).toBe(false);
  });

  it('reject an animal name over 100 graphemes', () => {
    const result = pet.homeward.animal.$safeParse({ ...animal, name: 'B'.repeat(101) });
    expect(result.success).toBe(false);
  });
});
