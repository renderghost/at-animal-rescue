import { toDatetimeString } from '@atproto/syntax';
import { pet } from '@homeward/lexicons';
import { isCountry } from '@/i18n/countries';
import { fits, MAX_DONATION_LINKS } from '@/lib/organisation-limits';

export type FieldError = 'required' | 'tooLong' | 'invalid';

/** Field names as submitted; donation rows are `donationUrl.0`, `donationLabel.0` and so on. */
export type OrganisationFormValues = Record<string, string>;
export type OrganisationFormErrors = Partial<Record<string, FieldError>>;

export type OrganisationProfile = Omit<pet.homeward.org.profile.Main, '$type'>;

export type ParsedOrganisationForm =
  | { ok: true; record: OrganisationProfile; values: OrganisationFormValues }
  | { ok: false; errors: OrganisationFormErrors; values: OrganisationFormValues };

export interface ParseOptions {
  now?: Date;
  /** Keep the original creation time when editing an existing profile. */
  createdAt?: string;
  /** Coarse coordinates from geocoding, if found. */
  coordinates?: { latitude: string; longitude: string };
}

const CONTACT_PREFERENCES = new Set(['email', 'bluesky', 'website']);
const DONATION_KINDS = new Set(['oneOff', 'recurring', 'both']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Turns the organisation form (onboarding or the full profile editor) into a
 * pet.homeward.org.profile record, or field errors. Fields the form doesn't include are
 * simply left out of the record.
 */
export function parseOrganisationForm(
  form: FormData,
  { now = new Date(), createdAt, coordinates }: ParseOptions = {},
): ParsedOrganisationForm {
  const values: OrganisationFormValues = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && !key.startsWith('$')) values[key] = value.trim();
  }
  const get = (key: string) => values[key] ?? '';
  values.country = get('country').toUpperCase();
  values.preferred = CONTACT_PREFERENCES.has(get('preferred')) ? get('preferred') : 'email';

  const errors: OrganisationFormErrors = {};
  /** Checks a text field's length; true when it has a value that fits. */
  const check = (key: string, required = false) => {
    if (!get(key)) {
      if (required) errors[key] = 'required';
      return false;
    }
    if (!fits(key, get(key))) errors[key] = 'tooLong';
    return !errors[key];
  };
  const checkUrl = (key: string, required = false) => {
    if (check(key, required) && !isHttpsUrl(get(key))) errors[key] = 'invalid';
  };

  check('displayName', true);
  check('locality', true);
  check('region');
  check('description');
  check('adoptionProcess');
  if (!isCountry(values.country)) errors.country = 'required';

  // Only the contact method the organisation prefers is required; any other is optional.
  if (check('email', values.preferred === 'email') && !EMAIL.test(get('email'))) {
    errors.email = 'invalid';
  }
  checkUrl('website', values.preferred === 'website');

  const donationLinks = [];
  for (let i = 0; i < MAX_DONATION_LINKS; i++) {
    const url = get(`donationUrl.${i}`);
    const label = get(`donationLabel.${i}`);
    if (!url && !label) continue;
    checkUrl(`donationUrl.${i}`, true);
    check(`donationLabel.${i}`);
    const kind = get(`donationKind.${i}`);
    donationLinks.push({
      url,
      ...(label && { label }),
      kind: DONATION_KINDS.has(kind) ? kind : 'oneOff',
    });
  }

  // A charity registration is optional, but needs both the register and the number.
  const charity = {
    registry: get('charityRegistry'),
    number: get('charityNumber'),
    registerUrl: get('charityUrl'),
  };
  const hasCharity = charity.registry || charity.number || charity.registerUrl;
  if (hasCharity) {
    check('charityRegistry', true);
    check('charityNumber', true);
    checkUrl('charityUrl');
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  // The lexicon is the source of truth: parsing validates the record and gives it its type.
  const parsed = pet.homeward.org.profile.$safeParse({
    $type: 'pet.homeward.org.profile',
    displayName: get('displayName'),
    ...(get('description') && { description: get('description') }),
    location: {
      locality: get('locality'),
      ...(get('region') && { region: get('region') }),
      country: values.country,
      ...coordinates,
    },
    contact: {
      preferred: values.preferred,
      ...(get('email') && { email: get('email') }),
      ...(get('website') && { website: get('website') }),
    },
    ...(donationLinks.length > 0 && { donationLinks }),
    ...(hasCharity && {
      charityRegistration: {
        registry: charity.registry,
        number: charity.number,
        ...(charity.registerUrl && { registerUrl: charity.registerUrl }),
      },
    }),
    ...(get('adoptionProcess') && { adoptionProcess: get('adoptionProcess') }),
    createdAt: createdAt ?? toDatetimeString(now),
  });
  // Unreachable while the checks above match the lexicon; never publish an invalid record.
  if (!parsed.success) throw new Error(`Invalid organisation profile: ${parsed.reason.message}`);
  const { $type: _type, ...record } = parsed.value;
  return { ok: true, record, values };
}

/** Everything the profile editor writes; anything else on the record is kept as it is. */
const EDITED_FIELDS = new Set([
  '$type',
  'displayName',
  'description',
  'location',
  'contact',
  'donationLinks',
  'charityRegistration',
  'adoptionProcess',
  'createdAt',
]);

/**
 * The edited profile, keeping fields the form doesn't edit, such as images or fields added
 * by a newer version of Homeward, so saving never loses them.
 */
export function mergeProfile(
  existing: OrganisationProfile | undefined,
  edited: OrganisationProfile,
): OrganisationProfile {
  const kept = Object.entries(existing ?? {}).filter(([key]) => !EDITED_FIELDS.has(key));
  return { ...Object.fromEntries(kept), ...edited };
}

/** The form values for an existing profile, to prefill the editor. */
export function profileToFormValues(profile: OrganisationProfile): OrganisationFormValues {
  const values: OrganisationFormValues = {
    displayName: profile.displayName,
    description: profile.description ?? '',
    locality: profile.location.locality,
    region: profile.location.region ?? '',
    country: profile.location.country,
    preferred: profile.contact.preferred,
    email: profile.contact.email ?? '',
    website: profile.contact.website ?? '',
    charityRegistry: profile.charityRegistration?.registry ?? '',
    charityNumber: profile.charityRegistration?.number ?? '',
    charityUrl: profile.charityRegistration?.registerUrl ?? '',
    adoptionProcess: profile.adoptionProcess ?? '',
  };
  profile.donationLinks?.forEach((link, i) => {
    values[`donationUrl.${i}`] = link.url;
    values[`donationLabel.${i}`] = link.label ?? '';
    values[`donationKind.${i}`] = link.kind;
  });
  return values;
}

function isHttpsUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
