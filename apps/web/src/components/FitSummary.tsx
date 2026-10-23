import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ListingFit } from '@/server/listing-page/fit';
import { Badge, MATCH_TONES } from './Badge';

/**
 * Under a listing's title (#40): how it fits a signed-in adopter, with a link to the
 * reasons, or an invitation to find out. Nothing for organisations.
 */
export async function FitSummary({
  fit,
  title,
  name,
}: {
  fit: ListingFit;
  title: string;
  /** The organisation's name. */
  name: string;
}) {
  if (fit.kind === 'none') return null;
  const t = await getTranslations('Fit');

  if (fit.kind === 'invite') {
    return (
      <p className="mt-4 max-w-prose">
        {fit.viewer === 'anonymous'
          ? t.rich('inviteAnonymous', {
              title,
              signIn: (chunks) => <Link href="/sign-in">{chunks}</Link>,
              getStarted: (chunks) => <Link href="/get-started">{chunks}</Link>,
            })
          : t.rich('inviteNewcomer', {
              title,
              link: (chunks) => <Link href="/welcome">{chunks}</Link>,
            })}
      </p>
    );
  }

  const match = await getTranslations('Match');
  const counts = [
    fit.conflicts > 0 && t('conflicts', { count: fit.conflicts }),
    fit.unknowns > 0 && t('unknowns', { count: fit.unknowns }),
  ].filter((part) => part !== false);
  const line =
    fit.criteria.length === 0
      ? t('nothingToCompare', { name })
      : counts.length > 0
        ? counts.join(' · ')
        : t('everythingFits');
  return (
    <div className="mt-4 max-w-prose rounded-md border border-line bg-surface p-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge tone={MATCH_TONES[fit.summary]}>{match(fit.summary)}</Badge>
        <span>{line}</span>
        {fit.criteria.length > 0 && <a href="#criteria">{t('seeHow')}</a>}
      </p>
      <p className="mt-2 text-sm text-muted">{t('private')}</p>
    </div>
  );
}
