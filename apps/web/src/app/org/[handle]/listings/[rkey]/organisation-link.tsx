'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** The organisation's page, from the listing's address (a not-found page gets no params). */
export function OrganisationLink({ label }: { label: string }) {
  const org = usePathname().split('/listings/')[0];
  return org?.startsWith('/org/') ? <Link href={org}>{label}</Link> : null;
}
