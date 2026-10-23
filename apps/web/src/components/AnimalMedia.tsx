'use client';

import { useTranslations } from 'next-intl';
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  changePhoto,
  saveVideos,
  uploadPhoto,
  type MediaErrorReason,
  type PhotoState,
  type VideoState,
} from '@/app/actions/animal-media';
import { MAX_VIDEOS, PHOTO_LIMITS } from '@/lib/media';
import { Button } from './Button';
import { Field, TextArea } from './Field';
import { FormAlert } from './FormAlert';
import { VideoEmbed } from './VideoEmbed';

export interface MediaPhoto {
  cid: string;
  alt: string;
  width?: number;
  height?: number;
}

const idle: PhotoState = { status: 'idle' };
const idleVideos: VideoState = { status: 'idle' };
const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Shrinks a photo in the browser before it's sent, to save the organisation's data. The
 * server re-encodes it anyway, so if the browser can't read it, the original goes as is.
 */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, PHOTO_LIMITS.maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= PHOTO_LIMITS.storedBytes) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mb-10 border-t border-line pt-6">
      <h2 id={id} className="mb-4 text-xl font-bold">
        {title}
      </h2>
      <p className="mb-6 text-muted">{hint}</p>
      {children}
    </section>
  );
}

/** Photos and video links for an animal that has been saved (#32). */
export function AnimalMedia({
  rkey,
  published,
  photos,
  videos,
}: {
  rkey: string;
  published: boolean;
  photos: MediaPhoto[];
  videos: string[];
}) {
  const t = useTranslations('AnimalMedia');
  const [changed, change, changing] = useActionState(changePhoto, idle);
  const [uploaded, upload, uploading] = useActionState(uploadPhoto, idle);
  const [saved, saveVideoLinks, savingVideos] = useActionState(saveVideos, idleVideos);
  const [preparing, prepare] = useTransition();
  const [tooLarge, setTooLarge] = useState(false);
  const headings = useRef(new Map<string, HTMLHeadingElement>());
  const errorText = (reason: MediaErrorReason) => t(`errors.${reason}`);

  // After a move, the photo's controls are somewhere else on the page: follow them there.
  useEffect(() => {
    if (changed.status === 'done' && changed.cid) headings.current.get(changed.cid)?.focus();
  }, [changed]);

  const uploadError = tooLarge ? 'tooLarge' : uploaded.status === 'error' && uploaded.error;
  const latest = [changed, uploaded]
    .filter((state) => state.status === 'done')
    .sort((a, b) => b.at - a.at)[0];
  const statusText =
    latest?.status === 'done'
      ? t(
          latest.change === 'added'
            ? 'statusAdded'
            : latest.change === 'alt'
              ? 'statusAlt'
              : latest.change === 'moved'
                ? 'statusMoved'
                : 'statusRemoved',
        )
      : '';

  function onUpload(event: FormEvent<HTMLFormElement>) {
    // Without JavaScript the form posts the photo as it is; here it's shrunk first.
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    prepare(async () => {
      const file = data.get('photo');
      if (file instanceof File && file.size > 0) {
        const small = await shrink(file);
        setTooLarge(small.size > PHOTO_LIMITS.uploadBytes);
        if (small.size > PHOTO_LIMITS.uploadBytes) return;
        data.set('photo', small);
      }
      startTransition(() => upload(data));
    });
  }

  const videoValues =
    saved.status === 'error'
      ? saved.values
      : Array.from({ length: MAX_VIDEOS }, (_, i) => videos[i] ?? '');

  return (
    <>
      <Section
        title={t('photos')}
        hint={`${t('photosHint')} ${published ? t('photosPublic') : t('photosDraft')}`}
      >
        <p role="status" className="sr-only">
          {statusText}
        </p>
        {changed.status === 'error' && !photos.some((photo) => photo.cid === changed.cid) && (
          <FormAlert>{errorText(changed.error)}</FormAlert>
        )}

        {photos.length > 0 && (
          <ol className="mb-8 grid gap-8">
            {photos.map((photo, index) => {
              const failed =
                changed.status === 'error' && changed.cid === photo.cid ? changed : undefined;
              const altError =
                failed && (failed.error === 'altRequired' || failed.error === 'altTooLong')
                  ? errorText(failed.error)
                  : undefined;
              return (
                <li key={photo.cid} className="rounded-md border border-line p-4">
                  <h3
                    tabIndex={-1}
                    ref={(node) => {
                      if (node) headings.current.set(photo.cid, node);
                      else headings.current.delete(photo.cid);
                    }}
                    className="mb-3 flex flex-wrap items-baseline gap-x-3 font-bold"
                  >
                    {t('photoN', { number: index + 1 })}
                    {index === 0 && (
                      <span className="rounded-sm border border-line-strong px-2 text-sm font-semibold text-muted">
                        {t('cover')}
                      </span>
                    )}
                  </h3>
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner-only, already sized */}
                  <img
                    src={`/organisation/animals/${rkey}/photos/${photo.cid}`}
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                    className="mb-4 h-auto max-h-80 w-auto max-w-full rounded-sm border border-line"
                  />
                  <form
                    action={change}
                    key={`${photo.cid}:${photo.alt}:${failed ? JSON.stringify(failed) : ''}`}
                  >
                    <input type="hidden" name="$rkey" value={rkey} />
                    <input type="hidden" name="$cid" value={photo.cid} />
                    {failed && <FormAlert>{errorText(failed.error)}</FormAlert>}
                    <TextArea
                      name="alt"
                      label={t('alt')}
                      hint={t('altHint')}
                      error={altError}
                      defaultValue={failed?.alt ?? photo.alt}
                      rows={2}
                    />
                    <div className="flex flex-wrap gap-3">
                      <Button type="submit" name="intent" value="alt" disabled={changing}>
                        {t('saveAlt')}
                      </Button>
                      {index > 0 && (
                        <Button
                          type="submit"
                          name="intent"
                          value="earlier"
                          variant="secondary"
                          disabled={changing}
                        >
                          {t('earlier')}
                        </Button>
                      )}
                      {index < photos.length - 1 && (
                        <Button
                          type="submit"
                          name="intent"
                          value="later"
                          variant="secondary"
                          disabled={changing}
                        >
                          {t('later')}
                        </Button>
                      )}
                      {index > 0 && (
                        <Button
                          type="submit"
                          name="intent"
                          value="cover"
                          variant="secondary"
                          disabled={changing}
                        >
                          {t('makeCover')}
                        </Button>
                      )}
                    </div>
                    {/* Two deliberate steps, without JavaScript: open the panel, then confirm. */}
                    <details className="mt-4">
                      <summary className="cursor-pointer font-semibold">
                        {t('removeHeading')}
                      </summary>
                      <Button
                        type="submit"
                        name="intent"
                        value="remove"
                        variant="secondary"
                        className="mt-3"
                        disabled={changing}
                      >
                        {t('removeConfirm', { number: index + 1 })}
                      </Button>
                    </details>
                  </form>
                </li>
              );
            })}
          </ol>
        )}

        {photos.length < PHOTO_LIMITS.count ? (
          <form
            action={upload}
            onSubmit={onUpload}
            noValidate
            key={JSON.stringify(uploaded)}
            className="rounded-md border border-line p-4"
          >
            <h3 className="mb-4 font-bold">{t('addHeading')}</h3>
            <input type="hidden" name="$rkey" value={rkey} />
            {uploadError && <FormAlert>{errorText(uploadError)}</FormAlert>}
            <Field
              type="file"
              name="photo"
              accept={ACCEPT}
              label={t('file')}
              hint={t('fileHint')}
              error={
                uploadError === 'noFile' ||
                uploadError === 'unreadable' ||
                uploadError === 'tooLarge'
                  ? errorText(uploadError)
                  : undefined
              }
              required
            />
            <TextArea
              name="alt"
              label={t('alt')}
              hint={t('altHint')}
              error={
                uploadError === 'altRequired' || uploadError === 'altTooLong'
                  ? errorText(uploadError)
                  : undefined
              }
              defaultValue={uploaded.status === 'error' ? uploaded.alt : ''}
              rows={2}
              required
            />
            <Button type="submit" disabled={preparing || uploading}>
              {preparing || uploading ? t('adding') : t('addPhoto')}
            </Button>
          </form>
        ) : (
          <p className="rounded-md border border-line bg-surface p-4">{t('full')}</p>
        )}
      </Section>

      <Section title={t('videos')} hint={t('videosHint')}>
        <form action={saveVideoLinks} noValidate key={`${JSON.stringify(saved)}:${videos.join()}`}>
          <input type="hidden" name="$rkey" value={rkey} />
          {saved.status === 'error' && (
            <FormAlert>{saved.error ? errorText(saved.error) : t('videosInvalid')}</FormAlert>
          )}
          {saved.status === 'saved' && (
            <p
              role="status"
              className="mb-6 rounded-md border border-match-line bg-match-soft p-4 text-match"
            >
              {t('videosSaved')}
            </p>
          )}
          {videoValues.map((value, i) => (
            <Field
              key={i}
              type="url"
              name="video"
              label={t('videoN', { number: i + 1 })}
              error={
                saved.status === 'error' && saved.errors[`video.${i}`]
                  ? t('errors.invalidVideo')
                  : undefined
              }
              defaultValue={value}
              autoComplete="off"
            />
          ))}
          <Button type="submit" disabled={savingVideos}>
            {savingVideos ? t('saving') : t('saveVideos')}
          </Button>
        </form>
        {videos.length > 0 && (
          <div className="mt-8 grid gap-4">
            {videos.map((url, i) => (
              <VideoEmbed key={url} url={url} label={t('videoLabel', { number: i + 1 })} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
