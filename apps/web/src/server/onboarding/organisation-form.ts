import { toDatetimeString } from '@atproto/syntax';
import { pet } from '@homeward/lexicons';
import { isCountry } from '@/i18n/countries';

export type OrganisationField = 'displayName' | 'locality' | 'country' | 'email' | 'website';
export type FieldError = 'required' | 'tooLong' | 'invalid';

export interface OrganisationFormValues {
  displayName: string;
  locality: string;
  region: string;
  country: string;
  preferred: string;
  email: string;
  website: string;
}

export type OrganisationProfile = Omit<pet.homeward.org.profile.Main, '$type'>;

export type ParsedOrganisationForm =
  | { ok: true; record: OrganisationProfile }
  | {
      ok: false;
      errors: Partial<Record<OrganisationField, FieldError>>;
      values: OrganisationFormValues;
    };

const CONTACT_PREFERENCES = new Set(['email', 'bluesky', 'website']);
const graphemes = new Intl.Segmenter();
const length = (value: string) => [...graphemes.segment(value)].length;

function text(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

/** Turns the onboarding form into a pet.homeward.org.profile record, or field errors. */
export function parseOrganisationForm(form: FormData, now = new Date()): ParsedOrganisationForm {
  const values: OrganisationFormValues = {
    displayName: text(form, 'displayName'),
    locality: text(form, 'locality'),
    region: text(form, 'region'),
    country: text(form, 'country').toUpperCase(),
    preferred: CONTACT_PREFERENCES.has(text(form, 'preferred')) ? text(form, 'preferred') : 'email',
    email: text(form, 'email'),
    website: text(form, 'website'),
  };
  const errors: Partial<Record<OrganisationField, FieldError>> = {};

  if (!values.displayName) errors.displayName = 'required';
  else if (length(values.displayName) > 100) errors.displayName = 'tooLong';
  if (!values.locality) errors.locality = 'required';
  else if (length(values.locality) > 100) errors.locality = 'tooLong';
  if (!isCountry(values.country)) errors.country = 'required';

  // Only the contact method the organisation prefers is required; any other is optional.
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'invalid';
  else if (values.preferred === 'email' && !values.email) errors.email = 'required';
  if (values.website && !isHttpsUrl(values.website)) errors.website = 'invalid';
  else if (values.preferred === 'website' && !values.website) errors.website = 'required';

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };

  // The lexicon is the source of truth: parsing validates the record and gives it its type.
  const parsed = pet.homeward.org.profile.$safeParse({
    $type: 'pet.homeward.org.profile',
    displayName: values.displayName,
    location: {
      locality: values.locality,
      ...(values.region && { region: values.region }),
      country: values.country,
    },
    contact: {
      preferred: values.preferred,
      ...(values.email && { email: values.email }),
      ...(values.website && { website: values.website }),
    },
    createdAt: toDatetimeString(now),
  });
  if (!parsed.success) return { ok: false, errors: { displayName: 'invalid' }, values };
  const { $type: _type, ...record } = parsed.value;
  return { ok: true, record };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
