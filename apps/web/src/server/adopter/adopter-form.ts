import { toDatetimeString } from '@atproto/syntax';
import type { pet } from '@homeward/lexicons';
import { AGE_GROUPS, SIZES, SPECIES } from '@homeward/lexicons';
import { isCountry } from '@/i18n/countries';
import {
  CHOICES,
  HOURS_ALONE_BANDS,
  MAX_ABOUT,
  MAX_PLACE,
  OTHER_ANIMALS,
  UNANSWERED,
  YES_NO,
} from '@/lib/adopter-questions';

export type Household = Omit<pet.homeward.adopter.household.Main, '$type'>;
export type PrivateLocation = Omit<pet.homeward.adopter.location.Main, '$type'>;
export type AdopterProfile = Omit<pet.homeward.adopter.profile.Main, '$type'>;
export type Seeking = NonNullable<AdopterProfile['seeking']>;

export type FieldError = 'required' | 'tooLong' | 'invalid';
export type AdopterFormValues = Record<string, string>;
export type AdopterFormErrors = Partial<Record<string, FieldError>>;

/** Every household field this form writes; any others on the record are kept. */
const EDITED_FIELDS = new Set([
  '$type',
  'children',
  'otherAnimals',
  'garden',
  'landlordPermission',
  'hoursAlone',
  'updatedAt',
  ...Object.keys(YES_NO),
  ...Object.keys(CHOICES),
]);

export interface ParsedAdopterForm {
  ok: boolean;
  values: AdopterFormValues;
  errors: AdopterFormErrors;
  /** The household answers (only those given). */
  household: Household;
  /** The town or postcode district typed, if any. */
  place?: { text: string; country: string };
  publish: boolean;
  seeking: Seeking;
  about?: string;
}

const graphemes = new Intl.Segmenter();
const length = (value: string) => [...graphemes.segment(value)].length;
const utf8 = new TextEncoder();
const fits = (value: string, max: number) =>
  length(value) <= max && utf8.encode(value).length <= max * 10;

/** Turns the adopter profile form into private household answers and public preferences. */
export function parseAdopterForm(
  form: FormData,
  { now = new Date() }: { now?: Date } = {},
): ParsedAdopterForm {
  const values: AdopterFormValues = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && !key.startsWith('$')) values[key] = value.trim();
  }
  const get = (key: string) => values[key] ?? '';
  const ticked = (key: string) => get(key) === 'on';
  const yesNo = (key: string) =>
    get(key) === 'yes' ? true : get(key) === 'no' ? false : undefined;
  const errors: AdopterFormErrors = {};
  const household: Household = { updatedAt: toDatetimeString(now) };

  // Household
  const children = yesNo('children');
  if (children === false) household.children = { present: false };
  if (children === true) {
    household.children = { present: true };
    if (get('youngestAge')) {
      const age = Number(get('youngestAge'));
      if (Number.isInteger(age) && age >= 0 && age <= 17) household.children.youngestAge = age;
      else errors.youngestAge = 'invalid';
    }
  }

  if (get('otherAnimals') === 'none') household.otherAnimals = [];
  if (get('otherAnimals') === 'some') {
    const kinds = OTHER_ANIMALS.filter((kind) => ticked(`otherAnimal.${kind}`));
    if (kinds.length > 0) household.otherAnimals = kinds;
    else errors.otherAnimals = 'required';
  }

  for (const [field, allowed] of Object.entries(CHOICES)) {
    if ((allowed as readonly string[]).includes(get(field))) {
      (household as Record<string, unknown>)[field] = get(field);
    }
  }

  // Home
  const garden = yesNo('garden');
  if (garden === false) household.garden = { present: false };
  if (garden === true) {
    const secure = yesNo('gardenSecure');
    household.garden = { present: true, ...(secure !== undefined && { secure }) };
  }
  if (household.tenure === 'rent') {
    const permission = yesNo('landlordPermission');
    if (permission !== undefined) household.landlordPermission = permission;
  }

  // Care, time and visits
  const hours = Number(get('hoursAlone'));
  if ((HOURS_ALONE_BANDS as readonly number[]).includes(hours)) household.hoursAlone = hours;
  for (const [key, field] of Object.entries(YES_NO)) {
    const answer = yesNo(key);
    if (answer !== undefined) household[field] = answer;
  }

  // Location (private)
  let place: ParsedAdopterForm['place'];
  values.country = get('country').toUpperCase();
  if (get('location')) {
    if (!fits(get('location'), MAX_PLACE)) errors.location = 'tooLong';
    if (!isCountry(values.country)) errors.country = 'required';
    else place = { text: get('location'), country: values.country };
  }

  // Public profile (optional)
  const seeking: Seeking = {};
  const species = SPECIES.filter((key) => ticked(`species.${key}`));
  const sizes = SIZES.filter((key) => ticked(`size.${key}`));
  const ageGroups = AGE_GROUPS.filter((key) => ticked(`ageGroup.${key}`));
  if (species.length > 0) seeking.species = species;
  if (sizes.length > 0) seeking.sizes = sizes;
  if (ageGroups.length > 0) seeking.ageGroups = ageGroups;
  if (get('about') && !fits(get('about'), MAX_ABOUT)) errors.about = 'tooLong';

  return {
    ok: Object.keys(errors).length === 0,
    values,
    errors,
    household,
    place,
    publish: ticked('publish'),
    seeking,
    ...(get('about') && { about: get('about') }),
  };
}

/**
 * The household to store: the form's answers, keeping fields this form doesn't edit
 * (such as ones added by a newer version) so saving never loses them.
 */
export function mergeHousehold(existing: Household | undefined, edited: Household): Household {
  const kept = Object.entries(existing ?? {}).filter(([key]) => !EDITED_FIELDS.has(key));
  return { ...Object.fromEntries(kept), ...edited } as Household;
}

/** The band an answer falls in, for showing hours stored by another client. */
export function hoursBand(hours: number): number {
  return HOURS_ALONE_BANDS.find((band) => hours <= band) ?? 24;
}

/** Form values for what's stored, to prefill the form. Unanswered questions are "Prefer not to say". */
export function toFormValues({
  household = {},
  location,
  profile,
}: {
  household?: Partial<Household>;
  location?: PrivateLocation;
  profile?: AdopterProfile;
}): AdopterFormValues {
  const yesNo = (value: boolean | undefined) =>
    value === undefined ? UNANSWERED : value ? 'yes' : 'no';
  const values: AdopterFormValues = {
    children: yesNo(household.children?.present),
    youngestAge: household.children?.youngestAge?.toString() ?? '',
    otherAnimals: !household.otherAnimals
      ? UNANSWERED
      : household.otherAnimals.length === 0
        ? 'none'
        : 'some',
    garden: yesNo(household.garden?.present),
    gardenSecure: yesNo(household.garden?.secure),
    landlordPermission: yesNo(household.landlordPermission),
    hoursAlone:
      household.hoursAlone === undefined ? UNANSWERED : String(hoursBand(household.hoursAlone)),
    location: location?.label ?? '',
    country: location?.country ?? '',
    publish: profile ? 'on' : '',
    about: profile?.about ?? '',
  };
  for (const kind of household.otherAnimals ?? []) values[`otherAnimal.${kind}`] = 'on';
  for (const field of Object.keys(CHOICES) as Array<keyof typeof CHOICES>) {
    values[field] = household[field] ?? UNANSWERED;
  }
  for (const [key, field] of Object.entries(YES_NO)) values[key] = yesNo(household[field]);
  for (const key of profile?.seeking?.species ?? []) values[`species.${key}`] = 'on';
  for (const key of profile?.seeking?.sizes ?? []) values[`size.${key}`] = 'on';
  for (const key of profile?.seeking?.ageGroups ?? []) values[`ageGroup.${key}`] = 'on';
  return values;
}
