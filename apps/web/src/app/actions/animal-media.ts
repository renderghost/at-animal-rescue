'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isAnimalKey } from '@/server/animals/animals';
import { requireOrganisation } from '@/server/animals/current-org';
import {
  addPhoto,
  MediaError,
  movePhoto,
  removePhoto,
  setVideos,
  updatePhotoAlt,
  type VideoErrors,
} from '@/server/animals/media';

export type MediaErrorReason = MediaError['reason'] | 'noFile';
export type PhotoChange = 'added' | 'alt' | 'moved' | 'removed';

export type PhotoState =
  | { status: 'idle' }
  /** `cid` is the photo to bring focus back to; `at` tells repeated results apart. */
  | { status: 'done'; change: PhotoChange; cid?: string; at: number }
  | { status: 'error'; error: MediaErrorReason; cid?: string; alt?: string };

export type VideoState =
  | { status: 'idle' }
  | { status: 'saved'; at: number }
  | { status: 'error'; errors: VideoErrors; values: string[]; error?: MediaError['reason'] };

async function target(form: FormData) {
  const { did, client } = await requireOrganisation();
  const rkey = form.get('$rkey');
  if (typeof rkey !== 'string' || !isAnimalKey(rkey)) redirect('/organisation/animals');
  return { did, client, rkey };
}

function failure(err: unknown, details: { alt?: string; cid?: string }): PhotoState {
  if (err instanceof MediaError) return { status: 'error', error: err.reason, ...details };
  throw err;
}

/** Adds a photo, already shrunk by the browser when it could be; always re-encoded here. */
export async function uploadPhoto(_previous: PhotoState, form: FormData): Promise<PhotoState> {
  const { did, client, rkey } = await target(form);
  const file = form.get('photo');
  const alt = String(form.get('alt') ?? '');
  if (!(file instanceof File) || file.size === 0) return { status: 'error', error: 'noFile', alt };
  try {
    await addPhoto(did, client, rkey, Buffer.from(await file.arrayBuffer()), alt);
  } catch (err) {
    return failure(err, { alt });
  }
  revalidatePath(`/organisation/animals/${rkey}`);
  return { status: 'done', change: 'added', at: Date.now() };
}

/** Changes one photo: its description or position, or removes it. */
export async function changePhoto(_previous: PhotoState, form: FormData): Promise<PhotoState> {
  const { did, client, rkey } = await target(form);
  const cid = String(form.get('$cid') ?? '');
  const alt = String(form.get('alt') ?? '');
  const intent = form.get('intent');
  let change: PhotoChange;
  try {
    if (intent === 'alt') {
      await updatePhotoAlt(did, client, rkey, cid, alt);
      change = 'alt';
    } else if (intent === 'earlier' || intent === 'later' || intent === 'cover') {
      await movePhoto(did, client, rkey, cid, intent);
      change = 'moved';
    } else if (intent === 'remove') {
      await removePhoto(did, client, rkey, cid);
      change = 'removed';
    } else return { status: 'idle' };
  } catch (err) {
    return failure(err, { alt, cid });
  }
  revalidatePath(`/organisation/animals/${rkey}`);
  return { status: 'done', change, cid: change === 'removed' ? undefined : cid, at: Date.now() };
}

export async function saveVideos(_previous: VideoState, form: FormData): Promise<VideoState> {
  const { did, client, rkey } = await target(form);
  const links = form.getAll('video').map(String);
  let result;
  try {
    result = await setVideos(did, client, rkey, links);
  } catch (err) {
    if (!(err instanceof MediaError)) throw err;
    return { status: 'error', errors: {}, values: links, error: err.reason };
  }
  if (!result.ok) return { status: 'error', errors: result.errors, values: links };
  revalidatePath(`/organisation/animals/${rkey}`);
  return { status: 'saved', at: Date.now() };
}
