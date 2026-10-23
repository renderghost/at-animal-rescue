import type { ListingSearchResult } from '@homeward/db';
import type { MatchSummary } from '@homeward/matching';
import { ageGroupOf } from '@homeward/lexicons';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatMoney } from '@/lib/format';
import { Badge, type BadgeTone } from './Badge';

// Each summary also carries its own glyph and words, never colour alone.
const MATCH_TONES: Record<MatchSummary, BadgeTone> = {
  strong: 'match',
  possible: 'unknown',
  conflicts: 'conflict',
};

/** One listing: its animals, status and fee. Staff also see what visitors can't. */
export async function ListingCard({
  listing,
  locale,
  ownerView = false,
  showOrganisation = false,
  distance,
  match,
}: {
  listing: ListingSearchResult;
  locale: string;
  ownerView?: boolean;
  /** In network-wide results, say which organisation and where. */
  showOrganisation?: boolean;
  /** How far it is from the searcher, as shown ("35 km away"), if known. */
  distance?: string;
  /** How the listing fits a signed-in adopter's home (#39). */
  match?: MatchSummary;
}) {
  const matchLabels = await getTranslations('Match');
  const t = await getTranslations('OrgPage');
  const taxonomy = await getTranslations('Taxonomy');
  const names = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    listing.animals.map((animal) => animal.name),
  );
  // Records can carry values added after this version; show those as they are.
  const label = (group: string, value: string) =>
    taxonomy.has(`${group}.${value}` as never) ? taxonomy(`${group}.${value}` as never) : value;
  const describe = (animal: ListingSearchResult['animals'][number]) => {
    const age = ageGroupOf(animal.species, animal.birthDate);
    return [
      label('species', animal.species),
      animal.sex && label('sex', animal.sex),
      age && label('ageGroup', age),
      animal.size && label('size', animal.size),
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const { fee } = listing;
  const amount =
    fee?.amount !== undefined && fee.currency && formatMoney(fee.amount, fee.currency, locale);

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <h3 className="text-lg font-bold">
        <Link
          href={`/org/${encodeURIComponent(listing.org.handle ?? listing.did)}/listings/${listing.uri.split('/').pop()}`}
        >
          {names}
        </Link>
      </h3>
      {listing.animals.length === 1 ? (
        <p className="text-muted">{describe(listing.animals[0]!)}</p>
      ) : (
        <ul className="grid gap-1 text-muted">
          {listing.animals.map((animal) => (
            <li key={animal.uri}>
              <span className="font-semibold text-fg">{animal.name}</span>: {describe(animal)}
            </li>
          ))}
        </ul>
      )}
      {showOrganisation && (
        <p className="text-sm text-muted">
          {[listing.org.displayName, listing.org.locality, distance].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {match && <Badge tone={MATCH_TONES[match]}>{matchLabels(match)}</Badge>}
        {listing.status === 'reserved' && <Badge>{t('reserved')}</Badge>}
        {listing.status === 'adopted' && <Badge tone="match">{t('adopted')}</Badge>}
        {listing.bonded && listing.animals.length > 1 && <Badge>{t('bonded')}</Badge>}
        {ownerView && !listing.orgApproved && <Badge tone="unknown">{t('awaitingReview')}</Badge>}
        {ownerView && listing.moderation === 'hidden' && (
          <Badge tone="conflict">{t('hiddenAfterReport')}</Badge>
        )}
      </div>
      {listing.status !== 'adopted' && fee && (
        <p className="text-sm">
          {fee.kind === 'none'
            ? t('noFee')
            : fee.kind === 'donation'
              ? amount
                ? t('donation', { amount })
                : t('donationAny')
              : amount
                ? t('fee', { amount })
                : t('noFee')}
        </p>
      )}
    </article>
  );
}
