import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/actions/sign-out';
import { getCurrentUser } from '@/server/auth/session';

/** "Sign in", or the signed-in handle with a sign-out button (works without JavaScript). */
export async function AccountNav() {
  const t = await getTranslations('Nav');
  const user = await getCurrentUser();
  if (!user) return <Link href="/sign-in">{t('signIn')}</Link>;

  return (
    <form action={signOut} className="flex flex-wrap items-center gap-3">
      <span className="text-muted">{t('signedInAs', { handle: user.handle })}</span>
      <Link href="/account">{t('account')}</Link>
      <button
        type="submit"
        className="cursor-pointer text-accent underline underline-offset-[0.15em] hover:text-accent-hover"
      >
        {t('signOut')}
      </button>
    </form>
  );
}
