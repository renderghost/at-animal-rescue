import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getPreferences } from '@/i18n/preferences';
import { profileHref } from '@/lib/fit';
import { formatDistance } from '@/lib/format';
import type { CriterionFit } from '@/server/listing-page/fit';
import type { ListingCriterion } from '@/server/listings/listing-form';
import { Badge } from './Badge';

type Translate = Awaited<ReturnType<typeof getTranslations<'Criteria'>>>;

/** A criterion as adopters read it, e.g. "Adults-only home" or "Adopters within 50 km". */
export async function criterionText(): Promise<(criterion: ListingCriterion) => string> {
  const t: Translate = await getTranslations('Criteria');
  const { formatLocale: locale, distanceUnit } = await getPreferences();
  const or = (items: string[]) =>
    new Intl.ListFormat(locale, { type: 'disjunction' }).format(items);
  const known = (group: string, value: string) =>
    t.has(`${group}.${value}` as never) ? t(`${group}.${value}` as never) : value;

  return (criterion) => {
    const c = criterion as Record<string, unknown> & { $type: string };
    const kind = c.$type.replace('pet.homeward.listing#', '');
    switch (kind) {
      case 'childrenCriterion':
        if (!c.allowed) return t('childrenNo');
        return typeof c.minAge === 'number' && c.minAge > 0
          ? t('childrenMinAge', { age: c.minAge })
          : t('childrenYes');
      case 'otherAnimalsCriterion': {
        const animals = known('animals', String(c.animal));
        return c.allowed ? t('otherYes', { animals }) : t('otherNo', { animals });
      }
      case 'experienceCriterion':
        return known('experience', String(c.minimum));
      case 'homeTypeCriterion':
        return t('homeType', {
          types: or((c.allowed as string[]).map((v) => known('homeTypes', v))),
        });
      case 'gardenCriterion':
        return c.secure ? t('gardenSecure') : t('garden');
      case 'settingCriterion':
        return t('setting', {
          settings: or((c.allowed as string[]).map((v) => known('settings', v))),
        });
      case 'timeAloneCriterion':
        return t('timeAlone', { hours: Number(c.maxHours) });
      case 'distanceCriterion':
        return t('distance', { distance: formatDistance(Number(c.maxKm), distanceUnit, locale) });
      case 'multipleVisitsCriterion':
        return typeof c.visits === 'number'
          ? t('multipleVisitsN', { visits: c.visits })
          : t('multipleVisits');
      case 'stepFreeCriterion':
      case 'landlordPermissionCriterion':
      case 'medicalCareCriterion':
      case 'specialDietCriterion':
      case 'behaviouralSupportCriterion':
      case 'homeVisitCriterion':
        return t(kind.replace(/Criterion$/, '') as 'stepFree');
      default:
        // A criterion added after this version (open union): say there is one.
        return t('unknownKind');
    }
  };
}

/**
 * Why a criterion fits, conflicts or can't be checked, in the adopter's own answers (#40),
 * e.g. "You said: children, the youngest aged 7".
 */
async function fitReason({ name, back }: { name: string; back: string }) {
  const t = await getTranslations('Fit');
  const criteria = await getTranslations('Criteria');
  const { formatLocale: locale, distanceUnit } = await getPreferences();
  const and = (items: string[]) =>
    new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);
  const animal = (kind: string) =>
    criteria.has(`animals.${kind}` as never) ? criteria(`animals.${kind}` as never) : kind;

  // Plain links: a full navigation lets the browser open the profile at the question and
  // mark it (:target), which a client-side transition doesn't.
  return ({ answer, unknown }: CriterionFit): ReactNode => {
    if (answer?.key === 'distance') {
      const km = answer.values?.km ?? 0;
      return km < 1
        ? t('answer.nearby')
        : t('answer.distance', { distance: formatDistance(km, distanceUnit, locale) });
    }
    if (answer?.animals)
      return t('answer.otherAnimals', { animals: and(answer.animals.map(animal)) });
    if (answer) {
      const key = `answer.${answer.key}` as 'answer.children';
      // An answer this version has no words for: the state badge still says it.
      return t.has(key) ? t(key, answer.values) : undefined;
    }
    switch (unknown?.why) {
      case 'unanswered':
        return (
          <>
            {t('unknown.unanswered')}{' '}
            <a href={profileHref(unknown.question, back)}>{t('answerLink')}</a>
          </>
        );
      case 'noLocation':
        return (
          <>
            {t('unknown.noLocation')}{' '}
            <a href={profileHref('location', back)}>{t('locationLink')}</a>
          </>
        );
      case 'noListingLocation':
        return t('unknown.noListingLocation');
      case 'unsupported':
        return t('unknown.unsupported', { name });
      default:
        return undefined;
    }
  };
}

/**
 * A listing's criteria as adopters will read them, each marked required or preferred. For a
 * signed-in adopter, each also says whether it fits their home and why, in the listing's
 * own order.
 */
export async function CriteriaList({
  criteria,
  fit,
}: {
  criteria: readonly ListingCriterion[];
  fit?: { criteria: readonly CriterionFit[]; name: string; back: string };
}) {
  const text = await criterionText();
  const match = await getTranslations('Match');
  const reason = fit && (await fitReason(fit));
  return (
    <ul className="grid gap-2">
      {criteria.map((criterion, i) => {
        const c = criterion as { level?: string; description?: unknown };
        const state = fit?.criteria[i];
        const why = state && reason?.(state);
        return (
          <li key={i} className="rounded-md border border-line bg-surface p-3">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{text(criterion)}</span>
              <Badge>{c.level === 'required' ? match('required') : match('preferred')}</Badge>
              {state && <Badge tone={state.state}>{match(state.state)}</Badge>}
            </p>
            {typeof c.description === 'string' && (
              <p className="mt-1 text-muted">{c.description}</p>
            )}
            {why && <p className="mt-1">{why}</p>}
          </li>
        );
      })}
    </ul>
  );
}
