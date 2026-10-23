import { pet } from '@homeward/lexicons';
import { describe, expect, it } from 'vitest';
import {
  animalUri,
  formatAmount,
  listingToFormValues,
  mergeListing,
  parseAmount,
  parseListingForm,
  publishProblems,
} from './listing-form';

const did = 'did:plc:hillfarm';
const BONNIE = '3m5z2kq5qns2a';
const CLYDE = '3m5z2kq5qns2b';
const now = new Date('2026-10-23T12:00:00.000Z');

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const pair = { [`animal.${BONNIE}`]: 'on', [`animal.${CLYDE}`]: 'on' };

describe('amounts', () => {
  it('reads amounts in minor units, in the currency’s own precision', () => {
    expect(parseAmount('85', 'EUR')).toBe(8500);
    expect(parseAmount('85,5', 'EUR')).toBe(8550);
    expect(parseAmount(' 85.50 ', 'GBP')).toBe(8550);
    expect(parseAmount('12000', 'ISK')).toBe(12000);
    expect(parseAmount('120.5', 'ISK')).toBe('invalid');
    expect(parseAmount('85.505', 'EUR')).toBe('invalid');
    expect(parseAmount('-5', 'EUR')).toBe('invalid');
    expect(parseAmount('1000000', 'EUR')).toBe('invalid');
    expect(formatAmount(8550, 'EUR')).toBe('85.50');
    expect(formatAmount(8500, 'EUR')).toBe('85');
    expect(formatAmount(12000, 'ISK')).toBe('12000');
  });
});

describe('parseListingForm', () => {
  it('builds a minimal listing for one animal', () => {
    const parsed = parseListingForm(form({ [`animal.${BONNIE}`]: 'on', bonded: 'yes' }), { did });
    expect(parsed).toEqual({
      ok: true,
      values: expect.any(Object),
      animalKeys: [BONNIE],
      content: { animals: [`at://${did}/pet.homeward.animal/${BONNIE}`] },
    });
  });

  it('builds a full listing that the lexicon accepts', () => {
    const parsed = parseListingForm(
      form({
        ...pair,
        bonded: 'yes',
        title: 'Bonnie and Clyde',
        summary: 'Two inseparable rabbits looking for a garden home.',
        'children.level': 'required',
        'children.allowed': 'yes',
        'children.minAge': '8',
        'dogs.level': 'preferred',
        'dogs.allowed': 'no',
        'cats.level': 'any',
        'cats.allowed': 'no',
        'experience.level': 'preferred',
        'experience.minimum': 'some',
        'homeType.level': 'required',
        'homeType.house': 'on',
        'garden.level': 'required',
        'garden.secure': 'on',
        'setting.level': 'preferred',
        'setting.suburban': 'on',
        'setting.rural': 'on',
        'stepFree.level': 'preferred',
        'timeAlone.level': 'required',
        'timeAlone.maxHours': '4',
        'medicalCare.level': 'required',
        'medicalCare.description': 'Daily eye drops.',
        'distance.level': 'preferred',
        'distance.maxKm': '80',
        'homeVisit.level': 'required',
        'multipleVisits.level': 'preferred',
        'multipleVisits.visits': '2',
        'fee.kind': 'donation',
        'fee.amount': '60',
        'fee.currency': 'EUR',
        'location.locality': 'Bergen',
        'location.country': 'NL',
      }),
      { did },
    );
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const T = 'pet.homeward.listing#';
    expect(parsed.content).toEqual({
      animals: [
        `at://${did}/pet.homeward.animal/${BONNIE}`,
        `at://${did}/pet.homeward.animal/${CLYDE}`,
      ],
      bonded: true,
      title: 'Bonnie and Clyde',
      summary: 'Two inseparable rabbits looking for a garden home.',
      criteria: [
        { $type: `${T}childrenCriterion`, level: 'required', allowed: true, minAge: 8 },
        { $type: `${T}otherAnimalsCriterion`, level: 'preferred', animal: 'dog', allowed: false },
        { $type: `${T}experienceCriterion`, level: 'preferred', minimum: 'some' },
        { $type: `${T}homeTypeCriterion`, level: 'required', allowed: ['house'] },
        { $type: `${T}gardenCriterion`, level: 'required', secure: true },
        { $type: `${T}settingCriterion`, level: 'preferred', allowed: ['suburban', 'rural'] },
        { $type: `${T}stepFreeCriterion`, level: 'preferred' },
        { $type: `${T}timeAloneCriterion`, level: 'required', maxHours: 4 },
        { $type: `${T}medicalCareCriterion`, level: 'required', description: 'Daily eye drops.' },
        { $type: `${T}distanceCriterion`, level: 'preferred', maxKm: 80 },
        { $type: `${T}homeVisitCriterion`, level: 'required' },
        { $type: `${T}multipleVisitsCriterion`, level: 'preferred', visits: 2 },
      ],
      adoptionFee: { kind: 'donation', amount: { amount: 6000, currency: 'EUR' } },
    });
    expect(parsed.place).toEqual({ locality: 'Bergen', country: 'NL' });

    const listing = mergeListing(
      undefined,
      parsed.content,
      { ...parsed.place!, latitude: '52.67', longitude: '4.71' },
      now,
    );
    expect(listing).toMatchObject({ status: 'draft', createdAt: '2026-10-23T12:00:00.000Z' });
    const published = { $type: 'pet.homeward.listing', ...listing, status: 'available' };
    expect(pet.homeward.listing.$safeParse(published).success).toBe(true);

    // And back into the editor, unchanged.
    const again = parseListingForm(form(listingToFormValues(did, listing)), { did });
    expect(again.ok && again.content).toEqual(parsed.content);
  });

  it('reports what needs fixing', () => {
    const parsed = parseListingForm(
      form({
        title: 'x'.repeat(101),
        'children.level': 'required',
        'children.minAge': '30',
        'cats.level': 'preferred',
        'experience.level': 'required',
        'homeType.level': 'required',
        'timeAlone.level': 'preferred',
        'timeAlone.maxHours': 'four',
        'distance.level': 'required',
        'multipleVisits.level': 'preferred',
        'multipleVisits.visits': '1',
        'fee.kind': 'fee',
        'fee.currency': 'EUR',
        'location.locality': 'Bergen',
      }),
      { did },
    );
    expect(parsed).toMatchObject({
      ok: false,
      errors: {
        animals: 'required',
        title: 'tooLong',
        'children.allowed': 'required',
        'cats.allowed': 'required',
        'experience.minimum': 'required',
        homeType: 'required',
        'timeAlone.maxHours': 'invalid',
        'distance.maxKm': 'required',
        'multipleVisits.visits': 'invalid',
        'fee.amount': 'required',
        'location.country': 'required',
      },
    });
  });

  it('ignores details of criteria that don’t matter, and a bonded answer for one animal', () => {
    const parsed = parseListingForm(
      form({
        [`animal.${BONNIE}`]: 'on',
        bonded: 'no',
        'children.level': 'any',
        'children.minAge': 'nonsense',
        'distance.maxKm': '-3',
      }),
      { did },
    );
    expect(parsed.ok && parsed.content).toEqual({
      animals: [`at://${did}/pet.homeward.animal/${BONNIE}`],
    });
  });
});

describe('publishProblems', () => {
  const content = { animals: [animalUri(did, BONNIE)] };

  it('asks for the fee, and whether two or more animals must go together', () => {
    const one = mergeListing(undefined, { ...content }, undefined, now);
    expect(publishProblems(one)).toEqual(['fee']);
    const two = mergeListing(
      undefined,
      {
        animals: [...content.animals, animalUri(did, CLYDE)],
        adoptionFee: { kind: 'none' },
      },
      undefined,
      now,
    );
    expect(publishProblems(two)).toEqual(['bonded']);
    expect(publishProblems({ ...two, bonded: false })).toEqual([]);
  });

  it('keeps status, dates and the cross-post when the content changes', () => {
    const existing = {
      ...mergeListing(undefined, { ...content }, { locality: 'Bergen', country: 'NL' }, now),
      status: 'available',
      crossPost: { uri: 'at://did:plc:hillfarm/app.bsky.feed.post/3abc', cid: 'bafy' },
    } as never;
    const merged = mergeListing(existing, { ...content, title: 'Bonnie' }, undefined);
    expect(merged).toEqual({
      ...content,
      title: 'Bonnie',
      status: 'available',
      crossPost: { uri: 'at://did:plc:hillfarm/app.bsky.feed.post/3abc', cid: 'bafy' },
      createdAt: '2026-10-23T12:00:00.000Z',
    });
  });
});
