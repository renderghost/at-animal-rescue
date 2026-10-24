'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { revealShare, type ShareState } from '@/app/actions/share';
import { Badge, MATCH_TONES } from './Badge';
import { Button } from './Button';

const initialState: ShareState = { status: 'idle' };

/**
 * The adopter's answers behind a "Show answers" press (#42). Works without JavaScript: the
 * page comes back with them.
 */
export function ShareReveal({ token }: { token: string }) {
  const t = useTranslations('Share');
  const [state, action, pending] = useActionState(revealShare, initialState);

  if (state.status === 'gone') return <p role="status">{t('gone')}</p>;
  if (state.status === 'idle') {
    return (
      <form action={action} className="mb-6">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" disabled={pending}>
          {pending ? t('showing') : t('show')}
        </Button>
      </form>
    );
  }

  const { content } = state;
  return (
    <div className="grid gap-8">
      <section aria-labelledby="who" className="rounded-lg border border-line bg-surface p-5">
        <h2 id="who" className="mb-2 text-xl font-bold">
          {t('handle', { handle: content.handle })}
        </h2>
        <p className="mb-3">
          <a href={`https://bsky.app/profile/${content.handle}`} rel="noreferrer">
            {t('profileLink', { handle: content.handle })}
          </a>
        </p>
        {content.place && <p className="mb-3">{content.place}</p>}
        {content.about && (
          <>
            <h3 className="font-semibold">{t('about')}</h3>
            <p className="max-w-prose whitespace-pre-line">{content.about}</p>
          </>
        )}
      </section>

      {content.removed ? (
        <p className="rounded-md border border-dashed border-unknown-line bg-unknown-soft p-4 text-unknown">
          {t('removed')}
        </p>
      ) : (
        <>
          <section aria-labelledby="fit">
            <h2 id="fit" className="mb-3 text-xl font-bold">
              {t('fitHeading', { title: content.title })}
            </h2>
            {content.fit && content.fit.rows.length > 0 ? (
              <>
                <p className="mb-3">
                  <Badge tone={MATCH_TONES[content.fit.summary]}>{content.fit.summaryLabel}</Badge>
                </p>
                <ul className="grid gap-2">
                  {content.fit.rows.map((row, i) => (
                    <li key={i} className="rounded-md border border-line bg-surface p-3">
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold">{row.text}</span>
                        <Badge>{row.level}</Badge>
                        <Badge tone={row.state}>{row.stateLabel}</Badge>
                      </p>
                      {row.description && <p className="mt-1 text-muted">{row.description}</p>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{t('fitNone', { title: content.title })}</p>
            )}
          </section>

          <section aria-labelledby="answers">
            <h2 id="answers" className="mb-1 text-xl font-bold">
              {t('answersHeading')}
            </h2>
            <p className="mb-3 text-muted">{t('answersHint')}</p>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              {content.answers.map(({ question, answer }) => (
                <div key={question} className="contents">
                  <dt>{question}</dt>
                  <dd className="mb-2 font-semibold sm:mb-0">{answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}

      <p className="text-sm text-muted">
        {t('until', { date: content.until })}
        {content.listingPath && (
          <>
            {' '}
            <Link href={content.listingPath}>{t('listing', { title: content.title })}</Link>
          </>
        )}
      </p>
    </div>
  );
}
