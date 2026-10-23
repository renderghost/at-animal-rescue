import 'server-only';
import { headers } from 'next/headers';

/**
 * Homeward's public origin, for links that leave the site (emails, shared pages): SITE_URL
 * when set, as in production, otherwise the address this request came in on.
 */
export async function siteOrigin(): Promise<string> {
  if (process.env.SITE_URL) return new URL(process.env.SITE_URL).origin;
  const list = await headers();
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000';
  const protocol =
    list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}
