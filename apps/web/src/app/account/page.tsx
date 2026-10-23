import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { getCurrentRole } from '@/server/onboarding/current-role';

/**
 * "Your profile" in the navigation. The role is only looked up when it's followed, so other
 * pages don't need to ask the PDS on every request.
 */
export default async function AccountPage() {
  if (!(await getCurrentUser())) redirect('/sign-in');
  const role = await getCurrentRole();
  if (role === 'organisation') redirect('/organisation/profile');
  // The adopter profile arrives with #37.
  if (role === 'adopter') redirect('/welcome/done');
  redirect('/welcome');
}
