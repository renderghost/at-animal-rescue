import { describe, expect, it } from 'vitest';
import {
  ageOf,
  animalToFormValues,
  birthMonthFromAge,
  mergeAnimal,
  parseAnimalForm,
} from './animal-form';

const now = new Date('2026-10-23T12:00:00.000Z');
const createdAt = '2026-10-23T12:00:00.000Z';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const breedLabels = { dog: { germanShepherd: 'German Shepherd', galgo: 'Galgo' } };

describe('age helpers', () => {
  it('turns an approximate age into an estimated birth month and back', () => {
    expect(birthMonthFromAge(3, 6, now)).toBe('2023-04');
    expect(ageOf('2023-04', now)).toEqual({ years: 3, months: 6 });
    expect(birthMonthFromAge(0, 0, now)).toBe('2026-10');
    expect(ageOf('2020', now)).toEqual({ years: 6, months: 3 });
  });
});

describe('parseAnimalForm', () => {
  const basic = { name: ' Bonnie ', species: 'rabbit' };

  it('builds a minimal record', () => {
    expect(parseAnimalForm(form(basic), { now })).toMatchObject({
      ok: true,
      record: { name: 'Bonnie', species: 'rabbit', createdAt },
      identification: {},
    });
  });

  it('builds a full record, keeping identification apart', () => {
    const result = parseAnimalForm(
      form({
        name: 'Rex',
        species: 'dog',
        'breed.0': 'german shepherd',
        'breed.1': 'Galgo',
        'breed.2': 'Something local',
        mixedBreed: 'on',
        sex: 'male',
        ageMode: 'date',
        birthYear: '2024',
        birthMonth: '3',
        size: 'large',
        colours: 'black, tan , ',
        neutered: 'yes',
        vaccinated: 'no',
        microchipped: 'no',
        conditions: 'Hip dysplasia\n\nMild allergies',
        medication: 'Joint supplement daily',
        'trait.playful': 'on',
        'trait.loyal': 'on',
        story: 'Found near Valencia.',
        microchip: '9851 2345 6789 012',
        registry: 'Chipnummer',
      }),
      { now, breedLabels },
    );
    expect(result).toEqual({
      ok: true,
      values: expect.any(Object),
      record: {
        name: 'Rex',
        species: 'dog',
        breeds: ['germanShepherd', 'galgo', 'Something local'],
        mixedBreed: true,
        sex: 'male',
        birth: { date: '2024-03' },
        size: 'large',
        colours: ['black', 'tan'],
        neutered: true,
        vaccinated: false,
        microchipped: true,
        health: {
          conditions: ['Hip dysplasia', 'Mild allergies'],
          medication: 'Joint supplement daily',
        },
        traits: ['playful', 'loyal'],
        story: 'Found near Valencia.',
        createdAt,
      },
      identification: { microchip: '985123456789012', registry: 'Chipnummer' },
    });
  });

  it('stores an approximate age as an estimated month, and keeps it when unchanged', () => {
    const first = parseAnimalForm(
      form({ ...basic, ageMode: 'age', ageYears: '3', ageMonths: '6' }),
      {
        now,
      },
    );
    expect(first).toMatchObject({
      ok: true,
      record: { birth: { date: '2023-04', estimated: true } },
    });
    if (!first.ok) throw new Error('expected ok');

    // A fortnight later the same age shows; saving again must not move the date.
    const later = new Date('2026-11-06T12:00:00.000Z');
    const values = animalToFormValues(first.record, {}, later);
    expect(values).toMatchObject({
      ageMode: 'age',
      ageYears: '3',
      ageMonths: '7',
      originalBirth: '2023-04',
    });
    const again = parseAnimalForm(form(values), { now: later, createdAt });
    expect(again).toMatchObject({
      ok: true,
      record: { birth: { date: '2023-04', estimated: true } },
    });
  });

  it('checks dates of birth', () => {
    const date = (fields: Record<string, string>) =>
      parseAnimalForm(form({ ...basic, ageMode: 'date', ...fields }), { now });
    expect(date({ birthYear: '2025', birthMonth: '2', birthDay: '29' })).toMatchObject({
      errors: { birthDay: 'invalid' },
    });
    expect(date({ birthYear: '2026', birthMonth: '12' })).toMatchObject({
      errors: { birthYear: 'future' },
    });
    expect(date({ birthYear: '' })).toMatchObject({ errors: { birthYear: 'required' } });
    expect(date({ birthYear: '2024', birthDay: '3' })).toMatchObject({
      errors: { birthDay: 'invalid' },
    });
    expect(date({ birthYear: '2024' })).toMatchObject({ record: { birth: { date: '2024' } } });
  });

  it('reports what needs fixing', () => {
    const result = parseAnimalForm(
      form({
        species: 'other',
        colours: 'a, b, c, d, e, f',
        microchip: '12-34',
        'trait.calm': 'on',
      }),
      { now },
    );
    expect(result).toMatchObject({
      ok: false,
      errors: {
        name: 'required',
        speciesDetail: 'required',
        colours: 'tooMany',
        microchip: 'invalid',
      },
    });
  });

  it('round-trips through the editor', () => {
    const first = parseAnimalForm(
      form({ ...basic, sex: 'female', neutered: 'no', 'trait.calm': 'on', microchip: 'ABC123456' }),
      { now },
    );
    if (!first.ok) throw new Error('expected ok');
    const values = animalToFormValues(first.record, first.identification, now);
    const again = parseAnimalForm(form(values), { now, createdAt });
    expect(again.ok && again.record).toEqual(first.record);
    expect(again.ok && again.identification).toEqual({ microchip: 'ABC123456' });
  });
});

describe('mergeAnimal', () => {
  it('keeps photos and videos the editor does not touch', () => {
    const photos = [{ image: { $type: 'blob' }, alt: 'Bonnie in the garden' }];
    const existing = { name: 'Old', species: 'rabbit', story: 'x', photos, createdAt } as never;
    const merged = mergeAnimal(existing, { name: 'Bonnie', species: 'rabbit', createdAt } as never);
    expect(merged).toEqual({ name: 'Bonnie', species: 'rabbit', photos, createdAt });
  });
});
