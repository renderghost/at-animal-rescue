import { BREEDS, SEXES, SIZES, SPECIES, TRAITS } from '@homeward/lexicons/taxonomy';
import { toDatetimeString } from '@atproto/syntax';
import { pet } from '@homeward/lexicons';
import { ANIMAL_LIMITS as L, MAX_BREEDS, YES_NO_UNKNOWN } from '@/lib/animal-fields';

export type AnimalRecord = Omit<pet.homeward.animal.Main, '$type'>;
export type Identification = { microchip?: string; registry?: string; passportNumber?: string };
export type FieldError = 'required' | 'tooLong' | 'tooMany' | 'invalid' | 'future';
export type AnimalFormValues = Record<string, string>;
export type AnimalFormErrors = Partial<Record<string, FieldError>>;

/** Breed names by species and key, in the current language, to recognise typed names. */
export type BreedLabels = Partial<Record<string, Record<string, string>>>;

export type ParsedAnimalForm =
  | { ok: true; values: AnimalFormValues; record: AnimalRecord; identification: Identification }
  | { ok: false; values: AnimalFormValues; errors: AnimalFormErrors };

const graphemes = new Intl.Segmenter();
const length = (value: string) => [...graphemes.segment(value)].length;
const utf8 = new TextEncoder();
const fits = (value: string, max: number) =>
  length(value) <= max && utf8.encode(value).length <= max * 10;
const pad = (n: number) => String(n).padStart(2, '0');

/** Completed years and months between a birth date (YYYY, YYYY-MM or YYYY-MM-DD) and now. */
export function ageOf(birthDate: string, now: Date): { years: number; months: number } | undefined {
  const match = /^(\d{4})(?:-(\d{2}))?/.exec(birthDate);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 7; // a year alone means mid-year
  const total = Math.max(0, (now.getUTCFullYear() - year) * 12 + now.getUTCMonth() + 1 - month);
  return { years: Math.floor(total / 12), months: total % 12 };
}

/** An estimated birth month (YYYY-MM) for an animal of about this age now. */
export function birthMonthFromAge(years: number, months: number, now: Date): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (years * 12 + months), 1),
  );
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Turns the animal editor's form into a public animal record and private identification. */
export function parseAnimalForm(
  form: FormData,
  {
    now = new Date(),
    createdAt,
    breedLabels = {},
  }: { now?: Date; createdAt?: string; breedLabels?: BreedLabels } = {},
): ParsedAnimalForm {
  const values: AnimalFormValues = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && !key.startsWith('$')) values[key] = value.trim();
  }
  const get = (key: string) => values[key] ?? '';
  const errors: AnimalFormErrors = {};
  const text = (key: string, max: number, required = false) => {
    const value = get(key);
    if (!value) {
      if (required) errors[key] = 'required';
      return undefined;
    }
    if (!fits(value, max)) {
      errors[key] = 'tooLong';
      return undefined;
    }
    return value;
  };
  const yesNo = (key: string) =>
    get(key) === 'yes' ? true : get(key) === 'no' ? false : undefined;
  const record: Record<string, unknown> = {};

  // The animal
  const name = text('name', L.name, true);
  const species = (SPECIES as readonly string[]).includes(get('species')) ? get('species') : '';
  if (!species) errors.species = 'required';
  const speciesDetail =
    species === 'other' ? text('speciesDetail', L.speciesDetail, true) : undefined;

  const known = BREEDS[species as keyof typeof BREEDS] ?? [];
  const labels = breedLabels[species] ?? {};
  const breeds: string[] = [];
  for (let i = 0; i < MAX_BREEDS; i++) {
    const typed = text(`breed.${i}`, L.breed);
    if (!typed) continue;
    const lower = typed.toLowerCase();
    // A known breed is stored by its key, so it reads correctly in every language.
    const key = known.find((k) => k.toLowerCase() === lower || labels[k]?.toLowerCase() === lower);
    const breed = key ?? typed;
    if (!breeds.includes(breed)) breeds.push(breed);
  }
  const sex = (SEXES as readonly string[]).includes(get('sex')) ? get('sex') : undefined;

  // Age: a date of birth (day optional), or an approximate age kept as an estimated month.
  let birth: { date: string; estimated?: boolean } | undefined;
  if (get('ageMode') === 'date') {
    const year = Number(get('birthYear'));
    const month = get('birthMonth') ? Number(get('birthMonth')) : undefined;
    const day = get('birthDay') ? Number(get('birthDay')) : undefined;
    if (!get('birthYear')) errors.birthYear = 'required';
    else if (!Number.isInteger(year) || year < 1970 || year > now.getUTCFullYear()) {
      errors.birthYear = 'invalid';
    } else if (month !== undefined && !(Number.isInteger(month) && month >= 1 && month <= 12)) {
      errors.birthMonth = 'invalid';
    } else if (day !== undefined && (month === undefined || !validDay(year, month, day))) {
      errors.birthDay = 'invalid';
    } else {
      const date = [String(year), month && pad(month), day && pad(day)].filter(Boolean).join('-');
      const start = new Date(
        `${[String(year), pad(month ?? 1), pad(day ?? 1)].join('-')}T00:00:00Z`,
      );
      if (start > now) errors.birthYear = 'future';
      else birth = { date };
    }
  } else if (get('ageMode') === 'age') {
    const years = get('ageYears') ? Number(get('ageYears')) : 0;
    const months = get('ageMonths') ? Number(get('ageMonths')) : 0;
    if (!get('ageYears') && !get('ageMonths')) errors.ageYears = 'required';
    else if (!Number.isInteger(years) || years < 0 || years > 40) errors.ageYears = 'invalid';
    else if (!Number.isInteger(months) || months < 0 || months > 11) errors.ageMonths = 'invalid';
    else {
      // Unchanged since it was saved: keep the stored month, so saving again never drifts.
      const original = get('originalBirth');
      const same = original && ageOf(original, now);
      birth = {
        date:
          same && same.years === years && same.months === months
            ? original
            : birthMonthFromAge(years, months, now),
        estimated: true,
      };
    }
  }

  // Appearance
  const size = (SIZES as readonly string[]).includes(get('size')) ? get('size') : undefined;
  const colours = get('colours')
    .split(',')
    .map((colour) => colour.trim())
    .filter(Boolean);
  if (colours.length > L.colours) errors.colours = 'tooMany';
  else if (colours.some((colour) => !fits(colour, L.colour))) errors.colours = 'tooLong';

  // Health and care
  const conditions = get('conditions')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (conditions.length > L.conditions) errors.conditions = 'tooMany';
  else if (conditions.some((line) => !fits(line, L.condition))) errors.conditions = 'tooLong';
  const medication = text('medication', L.medication);
  const notes = text('notes', L.notes);

  // Personality
  const traits = TRAITS.filter((trait) => get(`trait.${trait}`) === 'on');
  if (traits.length > L.traits) errors.traits = 'tooMany';
  const story = text('story', L.story);

  // Identification: private, never published.
  const microchip = get('microchip').replace(/[\s-]/g, '');
  if (microchip && !/^[A-Za-z0-9]{9,15}$/.test(microchip)) errors.microchip = 'invalid';
  const registry = text('registry', L.registry);
  const passportNumber = get('passportNumber');
  if (passportNumber && passportNumber.length > L.passportNumber) errors.passportNumber = 'tooLong';

  if (Object.keys(errors).length > 0 || !name) return { ok: false, values, errors };

  Object.assign(record, {
    name,
    species,
    ...(speciesDetail && { speciesDetail }),
    ...(breeds.length > 0 && { breeds }),
    ...(get('mixedBreed') === 'on' && { mixedBreed: true }),
    ...(sex && { sex }),
    ...(birth && { birth }),
    ...(size && { size }),
    ...(colours.length > 0 && { colours }),
    ...(yesNo('neutered') !== undefined && { neutered: yesNo('neutered') }),
    ...(yesNo('vaccinated') !== undefined && { vaccinated: yesNo('vaccinated') }),
    // A chip number means it's chipped, whatever was ticked.
    ...((microchip || yesNo('microchipped') !== undefined) && {
      microchipped: microchip ? true : yesNo('microchipped'),
    }),
    ...((conditions.length > 0 || medication || notes) && {
      health: {
        ...(conditions.length > 0 && { conditions }),
        ...(medication && { medication }),
        ...(notes && { notes }),
      },
    }),
    ...(traits.length > 0 && { traits }),
    ...(story && { story }),
    createdAt: createdAt ?? toDatetimeString(now),
  });
  const parsed = pet.homeward.animal.$safeParse({ $type: 'pet.homeward.animal', ...record });
  if (!parsed.success) throw new Error(`Invalid animal record: ${parsed.reason.message}`);
  const { $type: _type, ...animal } = parsed.value;
  return {
    ok: true,
    values,
    record: animal,
    identification: {
      ...(microchip && { microchip: microchip.toUpperCase() }),
      ...(registry && { registry }),
      ...(passportNumber && { passportNumber }),
    },
  };
}

function validDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(day) || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Fields the editor writes; anything else on a published record (photos, videos) is kept. */
const EDITED_FIELDS = new Set([
  '$type',
  'name',
  'species',
  'speciesDetail',
  'breeds',
  'mixedBreed',
  'sex',
  'birth',
  'size',
  'colours',
  'neutered',
  'vaccinated',
  'microchipped',
  'health',
  'traits',
  'story',
  'createdAt',
]);

/** The edited animal, keeping fields this editor doesn't touch, so saving never loses them. */
export function mergeAnimal(
  existing: AnimalRecord | undefined,
  edited: AnimalRecord,
): AnimalRecord {
  const kept = Object.entries(existing ?? {}).filter(([key]) => !EDITED_FIELDS.has(key));
  return { ...Object.fromEntries(kept), ...edited } as AnimalRecord;
}

/** Form values for a stored animal, to prefill the editor. */
export function animalToFormValues(
  animal: AnimalRecord,
  identification: Identification = {},
  now = new Date(),
): AnimalFormValues {
  const yesNo = (value: boolean | undefined) =>
    value === undefined ? YES_NO_UNKNOWN.unknown : value ? 'yes' : 'no';
  const values: AnimalFormValues = {
    name: animal.name,
    species: animal.species,
    speciesDetail: animal.speciesDetail ?? '',
    sex: animal.sex ?? '',
    size: animal.size ?? '',
    colours: animal.colours?.join(', ') ?? '',
    neutered: yesNo(animal.neutered),
    vaccinated: yesNo(animal.vaccinated),
    microchipped: yesNo(animal.microchipped),
    conditions: animal.health?.conditions?.join('\n') ?? '',
    medication: animal.health?.medication ?? '',
    notes: animal.health?.notes ?? '',
    story: animal.story ?? '',
    microchip: identification.microchip ?? '',
    registry: identification.registry ?? '',
    passportNumber: identification.passportNumber ?? '',
    ageMode: 'unknown',
  };
  if (animal.mixedBreed) values.mixedBreed = 'on';
  animal.breeds?.forEach((breed, i) => (values[`breed.${i}`] = breed));
  for (const trait of animal.traits ?? []) values[`trait.${trait}`] = 'on';
  if (animal.birth?.estimated) {
    const age = ageOf(animal.birth.date, now);
    values.ageMode = 'age';
    values.ageYears = String(age?.years ?? 0);
    values.ageMonths = String(age?.months ?? 0);
    values.originalBirth = animal.birth.date;
  } else if (animal.birth) {
    const [year, month, day] = animal.birth.date.split('-');
    values.ageMode = 'date';
    values.birthYear = year ?? '';
    values.birthMonth = month ? String(Number(month)) : '';
    values.birthDay = day ? String(Number(day)) : '';
  }
  return values;
}
