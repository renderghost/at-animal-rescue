import { pet } from '@homeward/lexicons';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { deleteAccountDataAction } from '@/app/actions/account-data';
import { Button } from '@/components/Button';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole, getRepoClient, lookupRecord } from '@/server/onboarding/current-role';
import { heldItems } from '../held';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('AccountData');
  return { title: t('deleteTitle'), robots: { index: false } };
}

/**
 * The deliberate second step before deleting (#46): exactly what goes and what stays, and
 * for accounts with public Homeward records, whether to delete those from the account too.
 */
export default async function DeleteAccountDataPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await getCurrentUser())) redirect('/sign-in');
  const role = await getCurrentRole();
  const { error } = await searchParams;
  const t = await getTranslations('AccountData');
  // An adopter's public profile is optional; only offer to delete one that exists.
  const client = role === 'adopter' ? await getRepoClient() : undefined;
  const hasPublic =
    role === 'organisation' ||
    (client !== undefined &&
      (await lookupRecord(() => client.get(pet.homeward.adopter.profile))).kind !== 'missing');

  return (
    <div className="max-w-2xl">
      <p className="mb-4">
        <Link href="/account/data">{t('back')}</Link>
      </p>
      <h1 className="mb-4 text-3xl font-bold">{t('deleteTitle')}</h1>
      {error === 'unavailable' && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-conflict-line bg-conflict-soft p-4 text-conflict"
        >
          {t('errors.unavailable')}
        </p>
      )}
      <h2 className="mb-2 text-lg font-bold">{t('willDelete')}</h2>
      <ul className="mb-4 grid list-disc gap-1 pl-6">
        {(await heldItems(role, false)).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mb-6">{t('signedOut')}</p>
      <h2 className="mb-2 text-lg font-bold">{t('stays')}</h2>
      <ul className="mb-6 grid list-disc gap-1 pl-6">
        {role === 'organisation' && <li>{t('staysModeration')}</li>}
        <li>{t('staysAccount')}</li>
      </ul>

      <form
        action={deleteAccountDataAction}
        className="rounded-lg border border-line bg-surface p-5"
      >
        {role && hasPublic && (
          <div className="mb-5">
            <label className="flex items-start gap-2 font-semibold">
              <input
                type="checkbox"
                name="alsoPublic"
                defaultChecked
                className="mt-0.5 size-5 shrink-0 accent-accent"
                aria-describedby="also-public-hint"
              />
              {t(`alsoPublic.${role}`)}
            </label>
            <p id="also-public-hint" className="pl-7 text-sm text-muted">
              {t(`alsoPublicHint.${role}`)}
            </p>
          </div>
        )}
        <p className="mb-4">{t('cantUndo')}</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button type="submit">{t('confirm')}</Button>
          <Link href="/account/data">{t('cancel')}</Link>
        </div>
      </form>
    </div>
  );
}
