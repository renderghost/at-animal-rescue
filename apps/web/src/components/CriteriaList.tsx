import { getTranslations } from 'next-intl/server';
import { getPreferences } from '@/i18n/preferences';
import { formatDistance } from '@/lib/format';
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

/** A listing's criteria as adopters will read them, each marked required or preferred. */
export async function CriteriaList({ criteria }: { criteria: readonly ListingCriterion[] }) {
  const text = await criterionText();
  const match = await getTranslations('Match');
  return (
    <ul className="grid gap-2">
      {criteria.map((criterion, i) => {
        const c = criterion as { level?: string; description?: unknown };
        return (
          <li key={i} className="rounded-md border border-line bg-surface p-3">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{text(criterion)}</span>
              <Badge>{c.level === 'required' ? match('required') : match('preferred')}</Badge>
            </p>
            {typeof c.description === 'string' && (
              <p className="mt-1 text-muted">{c.description}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
