import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { Role } from '@/server/onboarding/role';

/** What Homeward holds about an account of this role, worded; moderation only if kept. */
export async function heldItems(role: Role | undefined, withModeration: boolean) {
  const t = await getTranslations('AccountData.held');
  return [
    ...(role === 'adopter' ? [t('answers'), t('savedSearches'), t('shareLinks')] : []),
    ...(role === 'organisation' ? [t('drafts'), t('identification'), t('email')] : []),
    ...(role === 'organisation' && withModeration ? [t('moderation')] : []),
    t('sessions'),
  ];
}
