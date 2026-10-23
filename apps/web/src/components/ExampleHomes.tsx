import { evaluateMatch, type MatchSummary } from '@homeward/matching';
import { getTranslations } from 'next-intl/server';
import { EXAMPLE_HOMES } from '@/lib/example-homes';
import type { ListingCriterion } from '@/server/listings/listing-form';
import { Badge, type BadgeTone } from './Badge';
import { criterionText } from './CriteriaList';

const TONES: Record<MatchSummary, BadgeTone> = {
  strong: 'match',
  possible: 'unknown',
  conflicts: 'conflict',
};

/** How a listing's criteria suit a few made-up households (#33), as adopters would see it. */
export async function ExampleHomes({ criteria }: { criteria: readonly ListingCriterion[] }) {
  const t = await getTranslations('ExampleHomes');
  const match = await getTranslations('Match');
  const text = await criterionText();
  return (
    <section aria-labelledby="example-homes" className="mt-8">
      <h3 id="example-homes" className="mb-1 text-lg font-bold">
        {t('heading')}
      </h3>
      <p className="mb-4 text-muted">{t('hint')}</p>
      <ul className="grid gap-3">
        {EXAMPLE_HOMES.map(({ key, household }) => {
          const result = evaluateMatch({ criteria, household });
          const conflicts = result.criteria
            .map((evaluation, i) => ({ evaluation, criterion: criteria[i]! }))
            .filter(({ evaluation }) => evaluation.state === 'conflict')
            .map(({ criterion }) => text(criterion));
          const unknown = result.criteria.filter((e) => e.state === 'unknown').length;
          return (
            <li key={key} className="rounded-md border border-line bg-surface p-4">
              <p className="mb-2">{t(`homes.${key}` as 'homes.youngFamily')}</p>
              <Badge tone={TONES[result.summary]}>{match(result.summary)}</Badge>
              {conflicts.length > 0 && (
                <p className="mt-2 text-sm">{t('conflicts', { criteria: conflicts.join('; ') })}</p>
              )}
              {unknown > 0 && (
                <p className="mt-1 text-sm text-muted">{t('unknown', { count: unknown })}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
