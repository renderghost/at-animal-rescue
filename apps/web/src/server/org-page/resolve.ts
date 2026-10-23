import 'server-only';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPublicOrg, type PublicOrg } from './org';

/**
 * The organisation for /org/<handle>. A DID or a differently-cased handle redirects to the
 * canonical address; an unknown one is "not found".
 */
export async function resolveOrg(param: string, suffix = ''): Promise<PublicOrg> {
  const id = decodeURIComponent(param);
  const org = await getPublicOrg(id.startsWith('did:') ? { did: id } : { handle: id });
  if (!org) notFound();
  const canonical = org.handle ?? org.did;
  if (canonical !== id) permanentRedirect(`/org/${encodeURIComponent(canonical)}${suffix}`);
  return org;
}
