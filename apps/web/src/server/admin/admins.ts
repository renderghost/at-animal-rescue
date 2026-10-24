import 'server-only';

/** Moderators are configured by DID (#43): ADMIN_DIDS, separated by commas or spaces. */
export function adminDids(): string[] {
  return (process.env.ADMIN_DIDS ?? '').split(/[\s,]+/).filter((did) => did.startsWith('did:'));
}

export function isAdmin(did: string | undefined): boolean {
  return Boolean(did && adminDids().includes(did));
}
