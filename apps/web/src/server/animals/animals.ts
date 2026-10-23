import 'server-only';
import type { Client } from '@atproto/lex';
import { isValidTid, toDatetimeString } from '@atproto/syntax';
import { PrivateBlobStore } from '@homeward/db';
import { pet } from '@homeward/lexicons';
import { getDb, getKeyring } from '../db';
import { getPrivateStore } from '../private-store';
import { lookupRecord } from '../onboarding/current-role';
import {
  mergeAnimal,
  parseAnimalForm,
  type AnimalFormErrors,
  type AnimalFormValues,
  type AnimalRecord,
  type BreedLabels,
  type Identification,
} from './animal-form';

const DRAFT = 'pet.homeward.animal';
const IDENTIFICATION = 'pet.homeward.animal.identification';

export interface AnimalSummary {
  rkey: string;
  name: string;
  species: string;
  /** In the organisation's repository (public); otherwise a private draft. */
  published: boolean;
}

export type AnimalLookup =
  | { kind: 'found'; published: boolean; record: AnimalRecord; identification: Identification }
  | { kind: 'missing' }
  | { kind: 'unavailable' };

export type AnimalFormState =
  | { status: 'idle' }
  | { status: 'saved'; values: AnimalFormValues; published: boolean }
  | {
      status: 'error';
      values: AnimalFormValues;
      errors: AnimalFormErrors;
      /** The PDS couldn't be reached, so a published animal wasn't updated. */
      publishFailed?: boolean;
    };

export const isAnimalKey = (rkey: string) => isValidTid(rkey);

/** Where a draft's files are kept in the private blob store. */
export const draftFiles = (rkey: string) => `${DRAFT}/${rkey}`;

/** The organisation's animals: private drafts and those already published. */
export async function listAnimals(
  did: string,
  client: Client,
): Promise<{ animals: AnimalSummary[]; pdsUnavailable: boolean }> {
  const store = getPrivateStore();
  const animals: AnimalSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list(did, DRAFT, { limit: 100, cursor });
    for (const { rkey, value } of page.records) {
      animals.push({ rkey, name: value.name, species: value.species, published: false });
    }
    cursor = page.cursor;
  } while (cursor);

  let pdsUnavailable = false;
  try {
    let pdsCursor: string | undefined;
    do {
      const page = await client.list(pet.homeward.animal, { limit: 100, cursor: pdsCursor });
      for (const { uri, value } of page.records) {
        // Records the client validated against the lexicon; its inferred type is too loose.
        const animal = value as unknown as pet.homeward.animal.Main;
        const rkey = uri.split('/').pop()!;
        animals.push({ rkey, name: animal.name, species: animal.species, published: true });
      }
      pdsCursor = page.records.length > 0 ? page.cursor : undefined;
    } while (pdsCursor);
  } catch (err) {
    console.warn('Could not list published animals', err);
    pdsUnavailable = true;
  }
  animals.sort((a, b) => a.name.localeCompare(b.name));
  return { animals, pdsUnavailable };
}

/** One animal: a private draft if there is one, otherwise the published record. */
export async function loadAnimal(did: string, client: Client, rkey: string): Promise<AnimalLookup> {
  const store = getPrivateStore();
  const stored = await store.get(did, IDENTIFICATION, rkey);
  const ids: Identification = {
    ...(stored?.microchip && { microchip: stored.microchip }),
    ...(stored?.registry && { registry: stored.registry }),
    ...(stored?.passportNumber && { passportNumber: stored.passportNumber }),
  };
  const draft = await store.get(did, DRAFT, rkey);
  if (draft) {
    const { $type: _type, ...record } = draft;
    return { kind: 'found', published: false, record, identification: ids };
  }
  const published = await lookupRecord(() => client.get(pet.homeward.animal, { rkey }));
  if (published.kind !== 'found') return published;
  return { kind: 'found', published: true, record: published.record, identification: ids };
}

/**
 * Saves the editor's form: a draft stays private in Homeward; a published animal is updated
 * in the organisation's repository. Identification numbers always stay private.
 */
export async function saveAnimal(
  did: string,
  client: Client,
  rkey: string,
  form: FormData,
  breedLabels: BreedLabels,
): Promise<Exclude<AnimalFormState, { status: 'idle' }>> {
  const existing = await loadAnimal(did, client, rkey);
  if (existing.kind === 'unavailable') {
    const values = Object.fromEntries(
      [...form.entries()].filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    return { status: 'error', values, errors: {}, publishFailed: true };
  }
  const previous = existing.kind === 'found' ? existing.record : undefined;
  const parsed = parseAnimalForm(form, { createdAt: previous?.createdAt, breedLabels });
  if (!parsed.ok) return { status: 'error', values: parsed.values, errors: parsed.errors };

  const animal = mergeAnimal(previous, parsed.record);
  const published = existing.kind === 'found' && existing.published;
  const store = getPrivateStore();
  if (published) {
    try {
      await client.put(pet.homeward.animal, animal, { rkey });
    } catch (err) {
      console.warn('Could not update a published animal', err);
      return { status: 'error', values: parsed.values, errors: {}, publishFailed: true };
    }
  } else {
    await store.put(did, DRAFT, rkey, { $type: DRAFT, ...animal });
  }

  if (Object.keys(parsed.identification).length > 0) {
    await store.put(did, IDENTIFICATION, rkey, {
      $type: IDENTIFICATION,
      animal: `at://${did}/${DRAFT}/${rkey}`,
      ...parsed.identification,
      updatedAt: toDatetimeString(new Date()),
    });
  } else {
    await store.delete(did, IDENTIFICATION, rkey);
  }
  return { status: 'saved', values: parsed.values, published };
}

/** Deletes a private draft and its identification. Published animals aren't touched here. */
export async function deleteDraft(did: string, rkey: string): Promise<boolean> {
  const store = getPrivateStore();
  const deleted = await store.delete(did, DRAFT, rkey);
  if (deleted) {
    await store.delete(did, IDENTIFICATION, rkey);
    // Its photos, kept by Homeward until the animal is listed.
    await new PrivateBlobStore(getDb(), getKeyring()).delete(did, draftFiles(rkey));
  }
  return deleted;
}

/** The CID string of a photo's image, to address it in routes and the private blob store. */
export function photoCid(photo: NonNullable<AnimalRecord['photos']>[number]): string {
  const image = photo.image as { ref?: { toString(): string }; cid?: string };
  return image.ref?.toString() ?? image.cid ?? '';
}
