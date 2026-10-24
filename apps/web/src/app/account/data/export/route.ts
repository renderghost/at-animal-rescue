import { accountData } from '@/server/account/data';
import { getCurrentUser } from '@/server/auth/session';

/** "Download your data" (#46): everything Homeward holds about the account, as JSON. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Sign in to download your data.', { status: 401 });
  const exported = await accountData().export(user.did);
  const day = exported.exportedAt.slice(0, 10);
  return new Response(`${JSON.stringify({ handle: user.handle, ...exported }, null, 2)}\n`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="homeward-data-${day}.json"`,
      'cache-control': 'no-store',
    },
  });
}
