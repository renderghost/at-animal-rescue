'use server';

import { newRecordKey } from '@homeward/db';
import { redirect } from 'next/navigation';
import { getMessages } from 'next-intl/server';
import type { BreedLabels } from '@/server/animals/animal-form';
import {
  deleteDraft,
  isAnimalKey,
  saveAnimal,
  type AnimalFormState,
} from '@/server/animals/animals';
import { requireOrganisation } from '@/server/animals/current-org';

/** Breed names in the current language, so typed names are recognised as known breeds. */
async function breedLabels(): Promise<BreedLabels> {
  const messages = (await getMessages()) as { Taxonomy?: { breed?: BreedLabels } };
  return messages.Taxonomy?.breed ?? {};
}

/** Saves the animal editor: a new animal starts as a private draft. */
export async function saveAnimalAction(
  _previous: AnimalFormState,
  form: FormData,
): Promise<AnimalFormState> {
  const { did, client } = await requireOrganisation();
  const given = form.get('$rkey');
  const isNew = typeof given !== 'string' || !given;
  const rkey = isNew ? newRecordKey() : given;
  if (!isAnimalKey(rkey)) redirect('/organisation/animals');
  const result = await saveAnimal(did, client, rkey, form, await breedLabels());
  if (isNew && result.status === 'saved') redirect(`/organisation/animals/${rkey}?created=1`);
  return result;
}

export async function deleteAnimalDraft(form: FormData): Promise<void> {
  const { did } = await requireOrganisation();
  const rkey = form.get('$rkey');
  if (typeof rkey === 'string' && isAnimalKey(rkey)) await deleteDraft(did, rkey);
  redirect('/organisation/animals?deleted=1');
}
