import { getTranslations } from 'next-intl/server';
import { savePreferences } from '@/app/actions/preferences';
import { languageNames, languages } from '@/i18n/config';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { Button } from './Button';

const select =
  'min-h-11 rounded-sm border border-line-strong bg-surface px-3 py-2 text-fg text-base';

/** Language, country and units, chosen independently. Works without JavaScript. */
export async function PreferencesForm() {
  const t = await getTranslations('Preferences');
  const prefs = await getPreferences();

  return (
    <form action={savePreferences} aria-labelledby="preferences-heading" className="grid gap-3">
      <h2 id="preferences-heading" className="text-base font-semibold text-fg">
        {t('heading')}
      </h2>
      <p>{t('hint')}</p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1">
          <span>{t('language')}</span>
          <select name="language" defaultValue={prefs.language} className={select}>
            {languages.map((language) => (
              <option key={language} value={language} lang={language}>
                {languageNames[language]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span>{t('country')}</span>
          <select name="country" defaultValue={prefs.country ?? ''} className={select}>
            <option value="">{t('countryNotSet')}</option>
            {sortedCountries(prefs.language).map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span>{t('units')}</span>
          <select name="units" defaultValue={prefs.units} className={select}>
            <option value="auto">{t('unitsAuto')}</option>
            <option value="kilometer">{t('unitsKilometre')}</option>
            <option value="mile">{t('unitsMile')}</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
