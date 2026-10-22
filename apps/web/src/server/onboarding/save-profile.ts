import 'server-only';
import type { Client } from '@atproto/lex';
import { pet } from '@homeward/lexicons';
import { getPreferences } from '@/i18n/preferences';
import { getGeocoder } from '../geocode';
import {
  mergeProfile,
  parseOrganisationForm,
  type FieldError,
  type OrganisationFormValues,
  type OrganisationProfile,
} from './organisation-form';
import { locate } from './place';

/** Why a saved profile has no coordinates (so it won't appear in distance search). */
export type UnlocatedReason = 'notFound' | 'unavailable';

/** What an organisation form shows after submitting, when it doesn't move on. */
export type OrganisationFormState =
  | { status: 'idle' }
  | { status: 'saved'; values: OrganisationFormValues; unlocated?: UnlocatedReason }
  | {
      status: 'error';
      errors: Partial<Record<string, FieldError>>;
      values: OrganisationFormValues;
      /** Places with the typed name, for the person to choose from. */
      placeChoices?: string[];
      publishFailed?: boolean;
    };

export type SaveResult = Exclude<OrganisationFormState, { status: 'idle' }>;

/**
 * Validates the organisation form, finds coarse coordinates for its place, and publishes
 * the profile to the organisation's own repository. Used by onboarding and the editor.
 */
export async function saveOrganisationProfile(
  client: Client,
  form: FormData,
  existing?: OrganisationProfile,
): Promise<SaveResult> {
  const options = { createdAt: existing?.createdAt };
  const draft = parseOrganisationForm(form, options);
  if (!draft.ok) return { status: 'error', errors: draft.errors, values: draft.values };

  const chosen = form.get('place');
  const location = await locate(getGeocoder(), draft.record.location, {
    previous: existing?.location,
    chosen: typeof chosen === 'string' ? chosen : undefined,
    language: (await getPreferences()).language,
  });
  if (location.kind === 'choose') {
    return {
      status: 'error',
      errors: {},
      values: draft.values,
      placeChoices: location.choices.map((place) => place.label),
    };
  }

  const coordinates = location.kind === 'located' ? location.coordinates : undefined;
  if (location.kind === 'located' && location.region) form.set('region', location.region);
  const parsed = parseOrganisationForm(form, { ...options, coordinates });
  if (!parsed.ok) return { status: 'error', errors: parsed.errors, values: parsed.values };
  try {
    await client.put(pet.homeward.org.profile, mergeProfile(existing, parsed.record));
  } catch (err) {
    console.warn('Could not publish organisation profile', err);
    return { status: 'error', errors: {}, values: parsed.values, publishFailed: true };
  }
  return {
    status: 'saved',
    values: parsed.values,
    ...(location.kind === 'unlocated' && { unlocated: location.reason }),
  };
}
