import { getTranslations } from 'next-intl/server';
import { useId } from 'react';
import { POST_LIMITS } from '@/server/listings/post-text';
import { FormAlert } from './FormAlert';

/**
 * The Bluesky post's text (#36), with an "Also post on Bluesky" checkbox on the publish page.
 * Works without JavaScript; the server checks the length.
 */
export async function CrossPostFields({
  withCheckbox = false,
  checked = false,
  suggested,
  awaitingReview = false,
  error,
}: {
  withCheckbox?: boolean;
  checked?: boolean;
  suggested: string;
  awaitingReview?: boolean;
  error?: string;
}) {
  const t = await getTranslations('CrossPost');
  return <Fields t={t} {...{ withCheckbox, checked, suggested, awaitingReview, error }} />;
}

function Fields({
  t,
  withCheckbox,
  checked,
  suggested,
  awaitingReview,
  error,
}: {
  t: Awaited<ReturnType<typeof getTranslations<'CrossPost'>>>;
  withCheckbox: boolean;
  checked: boolean;
  suggested: string;
  awaitingReview: boolean;
  error?: string;
}) {
  const id = useId();
  const message =
    error && t.has(`errors.${error}` as never) ? t(`errors.${error}` as never) : undefined;
  return (
    <fieldset className="mb-6 rounded-md border border-line p-4">
      <legend className="px-1 font-semibold">{t('heading')}</legend>
      {message && <FormAlert>{message}</FormAlert>}
      {withCheckbox && (
        <>
          <label className="mb-1 flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              name="crossPost"
              defaultChecked={checked}
              className="size-5 accent-accent"
            />
            {t('publishCheckbox')}
          </label>
          <p className="mb-4 text-sm text-muted">
            {awaitingReview ? t('awaitingHint') : t('publishHint')}
          </p>
        </>
      )}
      <div className="grid gap-1">
        <label htmlFor={`${id}-text`} className="font-semibold">
          {t('text')}
        </label>
        <span id={`${id}-hint`} className="text-sm text-muted">
          {t('textHint')}
        </span>
        <textarea
          id={`${id}-text`}
          name="postText"
          defaultValue={suggested}
          rows={6}
          maxLength={POST_LIMITS.bytes}
          aria-describedby={`${id}-hint`}
          aria-invalid={message ? true : undefined}
          className="min-h-11 min-w-0 rounded-sm border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed text-fg aria-invalid:border-2 aria-invalid:border-danger"
        />
      </div>
    </fieldset>
  );
}
