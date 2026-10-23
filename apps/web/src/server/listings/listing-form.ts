import { isValidTid, toDatetimeString } from '@atproto/syntax';
import type { pet } from '@homeward/lexicons';
import { isCountry } from '@/i18n/countries';
import {
  CRITERIA_GROUPS,
  CURRENCIES,
  EXPERIENCE,
  HOME_TYPES,
  LISTING_LIMITS as L,
  minorDigits,
  OTHER_ANIMAL_ROWS,
  SETTINGS,
  type CriterionRow,
} from '@/lib/listing-fields';

export type ListingRecord = Omit<pet.homeward.listing.Main, '$type'>;
export type ListingCriterion = NonNullable<ListingRecord['criteria']>[number];
export type FieldError = 'required' | 'tooLong' | 'tooMany' | 'invalid' | 'inOpenListing';
export type ListingFormValues = Record<string, string>;
export type ListingFormErrors = Partial<Record<string, FieldError>>;

/** What the editor sets; status, dates, coordinates and the cross-post are kept elsewhere. */
export type ListingContent = Pick<
  ListingRecord,
  'animals' | 'bonded' | 'title' | 'summary' | 'criteria' | 'adoptionFee'
>;

/** A typed place to look up, when the listing's location differs from the organisation's. */
export interface PlaceInput {
  locality: string;
  region?: string;
  country: string;
}

export type ParsedListingForm =
  | {
      ok: true;
      values: ListingFormValues;
      content: ListingContent;
      /** Record keys of the chosen animals, in the order shown. */
      animalKeys: string[];
      place?: PlaceInput;
    }
  | { ok: false; values: ListingFormValues; errors: ListingFormErrors };

/** Private drafts carry this status; it's never published (the lexicon has no draft status). */
export const DRAFT_STATUS = 'draft';

/** Statuses during which an animal can't be in another listing (spec §2, Listing editor). */
export const OPEN_STATUSES: readonly string[] = [DRAFT_STATUS, 'available', 'reserved'];

const NSID = 'pet.homeward.listing';
const ROWS: readonly string[] = CRITERIA_GROUPS.flatMap((group) => group.rows);
const ANIMAL = 'pet.homeward.animal';
const graphemes = new Intl.Segmenter();
const length = (value: string) => [...graphemes.segment(value)].length;
const utf8 = new TextEncoder();
const fits = (value: string, max: number) =>
  length(value) <= max && utf8.encode(value).length <= max * 10;

export const animalUri = (did: string, rkey: string) =>
  `at://${did}/${ANIMAL}/${rkey}` as ListingRecord['animals'][number];

/** The record key of an animal URI in the listing's own repository, if it is one. */
export function animalKey(did: string, uri: string): string | undefined {
  const prefix = `at://${did}/${ANIMAL}/`;
  return uri.startsWith(prefix) ? uri.slice(prefix.length) : undefined;
}

/** A typed amount in minor units (85.50 → 8550), or 'invalid'. */
export function parseAmount(input: string, currency: string): number | 'invalid' {
  const digits = minorDigits(currency);
  const match = /^(\d{1,9})(?:[.,](\d+))?$/.exec(input.replace(/\s/g, ''));
  if (!match) return 'invalid';
  const [, whole, fraction = ''] = match;
  if (fraction.length > digits || Number(whole) > L.maxFee) return 'invalid';
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0);
}

/** An amount in minor units as typed: 8550 → '85.50', 8500 → '85'. */
export function formatAmount(minorUnits: number, currency: string): string {
  const digits = minorDigits(currency);
  const whole = Math.floor(minorUnits / 10 ** digits);
  const fraction = minorUnits % 10 ** digits;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(digits, '0')}`;
}

/** Turns the listing editor's form into the listing's content and an optional place. */
export function parseListingForm(form: FormData, { did }: { did: string }): ParsedListingForm {
  const values: ListingFormValues = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && !key.startsWith('$')) values[key] = value.trim();
  }
  const get = (key: string) => values[key] ?? '';
  const errors: ListingFormErrors = {};
  const text = (key: string, max: number) => {
    const value = get(key);
    if (!value) return undefined;
    if (!fits(value, max)) {
      errors[key] = 'tooLong';
      return undefined;
    }
    return value;
  };
  const yesNo = (key: string) => {
    const value = get(key) === 'yes' ? true : get(key) === 'no' ? false : undefined;
    if (value === undefined) errors[key] = 'required';
    return value;
  };
  const integer = (key: string, min: number, max: number, required: boolean) => {
    const value = get(key);
    if (!value) {
      if (required) errors[key] = 'required';
      return undefined;
    }
    const n = /^\d{1,5}$/.test(value) ? Number(value) : NaN;
    if (!(n >= min && n <= max)) {
      errors[key] = 'invalid';
      return undefined;
    }
    return n;
  };
  const someOf = <T extends string>(row: string, options: readonly T[]) => {
    const chosen = options.filter((option) => get(`${row}.${option}`) === 'on');
    if (chosen.length === 0) errors[row] = 'required';
    return chosen;
  };

  // Animals, in the order the editor shows them.
  const animalKeys = Object.keys(values)
    .filter((key) => key.startsWith('animal.') && values[key] === 'on')
    .map((key) => key.slice('animal.'.length))
    .filter(isValidTid);
  if (animalKeys.length === 0) errors.animals = 'required';
  else if (animalKeys.length > L.animals) errors.animals = 'tooMany';
  const bonded =
    animalKeys.length > 1 && (get('bonded') === 'yes' || get('bonded') === 'no')
      ? get('bonded') === 'yes'
      : undefined;
  const title = text('title', L.title);
  const summary = text('summary', L.summary);

  // Criteria: rows left at "Doesn't matter" aren't part of the listing.
  const criteria: ListingCriterion[] = [];
  for (const row of ROWS as readonly CriterionRow[]) {
    const level = get(`${row}.level`);
    if (level !== 'preferred' && level !== 'required') continue;
    const typed = (kind: string, details: object = {}) =>
      criteria.push({ $type: `${NSID}#${kind}`, level, ...details } as ListingCriterion);
    switch (row) {
      case 'children': {
        const allowed = yesNo('children.allowed');
        const minAge = allowed ? integer('children.minAge', 0, L.childMinAge, false) : undefined;
        if (allowed !== undefined) {
          typed('childrenCriterion', { allowed, ...(minAge !== undefined && { minAge }) });
        }
        break;
      }
      case 'dogs':
      case 'cats':
      case 'smallAnimals': {
        const allowed = yesNo(`${row}.allowed`);
        if (allowed !== undefined) {
          typed('otherAnimalsCriterion', { animal: OTHER_ANIMAL_ROWS[row], allowed });
        }
        break;
      }
      case 'experience': {
        const minimum = get('experience.minimum');
        if ((EXPERIENCE as readonly string[]).includes(minimum)) {
          typed('experienceCriterion', { minimum });
        } else errors['experience.minimum'] = 'required';
        break;
      }
      case 'homeType': {
        const allowed = someOf('homeType', HOME_TYPES);
        if (allowed.length > 0) typed('homeTypeCriterion', { allowed });
        break;
      }
      case 'garden':
        typed('gardenCriterion', get('garden.secure') === 'on' ? { secure: true } : {});
        break;
      case 'setting': {
        const allowed = someOf('setting', SETTINGS);
        if (allowed.length > 0) typed('settingCriterion', { allowed });
        break;
      }
      case 'timeAlone': {
        const maxHours = integer('timeAlone.maxHours', 0, L.maxHours, true);
        if (maxHours !== undefined) typed('timeAloneCriterion', { maxHours });
        break;
      }
      case 'medicalCare':
      case 'specialDiet':
      case 'behaviouralSupport': {
        const description = text(`${row}.description`, L.description);
        typed(`${row}Criterion`, description ? { description } : {});
        break;
      }
      case 'distance': {
        const maxKm = integer('distance.maxKm', 1, L.maxKm, true);
        if (maxKm !== undefined) typed('distanceCriterion', { maxKm });
        break;
      }
      case 'multipleVisits': {
        const visits = integer('multipleVisits.visits', L.minVisits, L.maxVisits, false);
        typed('multipleVisitsCriterion', visits !== undefined ? { visits } : {});
        break;
      }
      default:
        typed(`${row}Criterion`);
    }
  }

  // Adoption fee: unanswered until a kind is chosen (needed before publishing).
  let adoptionFee: ListingContent['adoptionFee'];
  const kind = get('fee.kind');
  if (kind === 'none') adoptionFee = { kind };
  else if (kind === 'donation' || kind === 'fee') {
    const currency = get('fee.currency');
    if (!(CURRENCIES as readonly string[]).includes(currency)) errors['fee.currency'] = 'invalid';
    else {
      const amount = get('fee.amount') ? parseAmount(get('fee.amount'), currency) : undefined;
      if (amount === 'invalid') errors['fee.amount'] = 'invalid';
      else if (amount === undefined && kind === 'fee') errors['fee.amount'] = 'required';
      else adoptionFee = { kind, ...(amount !== undefined && { amount: { amount, currency } }) };
    }
  }

  // Where the animals are, when it isn't where the organisation is.
  let place: PlaceInput | undefined;
  const locality = text('location.locality', 100);
  if (locality) {
    const region = text('location.region', 100);
    const country = get('location.country');
    if (!isCountry(country)) errors['location.country'] = 'required';
    else place = { locality, ...(region && { region }), country };
  }

  if (Object.keys(errors).length > 0) return { ok: false, values, errors };
  return {
    ok: true,
    values,
    animalKeys,
    content: {
      animals: animalKeys.map((rkey) => animalUri(did, rkey)),
      ...(bonded !== undefined && { bonded }),
      ...(title && { title }),
      ...(summary && { summary }),
      ...(criteria.length > 0 && { criteria }),
      ...(adoptionFee && { adoptionFee }),
    },
    ...(place && { place }),
  };
}

/**
 * The listing as saved: the editor's content over what the editor doesn't touch (status,
 * dates, cross-post). A new listing starts as a private draft.
 */
export function mergeListing(
  existing: ListingRecord | undefined,
  content: ListingContent,
  location: ListingRecord['location'],
  now = new Date(),
): ListingRecord {
  const base: Partial<ListingRecord> = existing ?? {
    status: DRAFT_STATUS,
    createdAt: toDatetimeString(now),
  };
  const {
    animals: _animals,
    bonded: _bonded,
    title: _title,
    summary: _summary,
    criteria: _criteria,
    adoptionFee: _fee,
    location: _location,
    ...kept
  } = base;
  return { ...kept, ...content, ...(location && { location }) } as ListingRecord;
}

/** The listing's own title, else its animals' names ("Bonnie and Clyde"). */
export function listingTitle(
  did: string,
  listing: Pick<ListingRecord, 'title' | 'animals'>,
  animals: ReadonlyArray<{ rkey: string; name: string }>,
  locale: string,
): string {
  if (listing.title) return listing.title;
  const names = listing.animals.map(
    (uri) => animals.find((animal) => animal.rkey === animalKey(did, uri))?.name ?? '?',
  );
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(names);
}

/** What still needs an answer before a listing can be published. */
export function publishProblems(listing: ListingRecord): Array<'bonded' | 'fee'> {
  const problems: Array<'bonded' | 'fee'> = [];
  if (listing.animals.length > 1 && listing.bonded === undefined) problems.push('bonded');
  if (!listing.adoptionFee) problems.push('fee');
  return problems;
}

/** The editor's form values for a saved listing. */
export function listingToFormValues(did: string, listing: ListingRecord): ListingFormValues {
  const values: ListingFormValues = {};
  for (const uri of listing.animals) {
    const rkey = animalKey(did, uri);
    if (rkey) values[`animal.${rkey}`] = 'on';
  }
  if (listing.bonded !== undefined) values.bonded = listing.bonded ? 'yes' : 'no';
  if (listing.title) values.title = listing.title;
  if (listing.summary) values.summary = listing.summary;

  for (const criterion of listing.criteria ?? []) {
    const c = criterion as Record<string, unknown> & { $type: string; level?: string };
    const kind = c.$type.replace(`${NSID}#`, '').replace(/Criterion$/, '');
    const row =
      kind === 'otherAnimals'
        ? Object.entries(OTHER_ANIMAL_ROWS).find(([, animal]) => animal === c.animal)?.[0]
        : kind;
    if (!row || !ROWS.includes(row)) continue;
    values[`${row}.level`] = c.level === 'required' ? 'required' : 'preferred';
    const set = (key: string, value: unknown) => {
      if (value !== undefined) values[`${row}.${key}`] = String(value);
    };
    if (typeof c.allowed === 'boolean') set('allowed', c.allowed ? 'yes' : 'no');
    if (Array.isArray(c.allowed)) for (const option of c.allowed) set(String(option), 'on');
    if (c.secure) set('secure', 'on');
    for (const key of ['minAge', 'minimum', 'maxHours', 'maxKm', 'visits', 'description']) {
      set(key, c[key]);
    }
  }

  const fee = listing.adoptionFee;
  if (fee) {
    values['fee.kind'] = fee.kind;
    if (fee.amount) {
      values['fee.currency'] = fee.amount.currency;
      values['fee.amount'] = formatAmount(fee.amount.amount, fee.amount.currency);
    }
  }
  if (listing.location) {
    values['location.locality'] = listing.location.locality;
    if (listing.location.region) values['location.region'] = listing.location.region;
    values['location.country'] = listing.location.country;
  }
  return values;
}
