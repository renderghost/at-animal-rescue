import 'server-only';
import type { Client } from '@atproto/lex';
import { sortedCountries } from '@/i18n/countries';
import { getPreferences } from '@/i18n/preferences';
import { CURRENCIES, currencyFor } from '@/lib/listing-fields';
import { loadOrganisationProfile } from '../onboarding/current-role';
import { animalChoices } from './listings';

/** What the listing editor offers: the organisation's animals, countries and currencies. */
export async function editorOptions(did: string, client: Client, rkey = '') {
  const { language } = await getPreferences();
  const [{ animals, pdsUnavailable }, profile] = await Promise.all([
    animalChoices(did, client, rkey),
    loadOrganisationProfile(client),
  ]);
  const currencyNames = new Intl.DisplayNames([language], { type: 'currency' });
  return {
    animals,
    pdsUnavailable,
    countries: sortedCountries(language),
    currencies: CURRENCIES.map((code) => ({ code, name: currencyNames.of(code) ?? code })),
    // An organisation lists in its own country's currency unless it says otherwise.
    defaultCurrency: currencyFor(
      profile.kind === 'found' ? profile.record.location.country : undefined,
    ),
  };
}
