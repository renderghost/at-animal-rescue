'use client';

import { useTranslations } from 'next-intl';
import { OSM_ATTRIBUTION } from '@/server/geocode/geocoder';

/** A choice between places that match what was typed, with the required OSM attribution. */
export function PlaceChoices({
  typed,
  choices,
  chosen,
  hint,
}: {
  typed: string;
  choices: string[];
  chosen?: string;
  hint: string;
}) {
  const t = useTranslations('Place');
  return (
    <fieldset className="mb-6 rounded-md border border-line p-4">
      <legend className="px-1 font-semibold">{t('choose', { place: typed })}</legend>
      <p className="mb-3 text-sm text-muted">{hint}</p>
      {choices.map((label) => (
        <label key={label} className="mb-2 flex items-start gap-2">
          <input
            type="radio"
            name="place"
            value={label}
            defaultChecked={chosen === label}
            className="mt-0.5 size-5 shrink-0 accent-accent"
          />
          {label}
        </label>
      ))}
      <p className="mt-3 text-sm text-muted">
        {t.rich('source', { link: (chunks) => <a href={OSM_ATTRIBUTION.href}>{chunks}</a> })}
      </p>
    </fieldset>
  );
}
