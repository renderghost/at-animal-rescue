'use server';

import { redirect } from 'next/navigation';
import { endSession } from '@/server/auth/session';

export async function signOut(): Promise<void> {
  await endSession();
  redirect('/');
}
