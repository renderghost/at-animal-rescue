import { isValidDid, isValidHandle } from '@atproto/syntax';

export interface ResolvedAccount {
  did: string;
  /** Present when the handle in the DID document points back to the same DID. */
  handle?: string;
  /** HTTPS origin of the account's PDS. */
  pds: string;
}

/** The parts of @atproto/identity we use, so tests can supply fakes. */
export interface IdentityResolver {
  resolveHandle(handle: string): Promise<string | undefined>;
  resolveDid(did: string): Promise<{ handle?: string; pds?: string } | undefined>;
}

export type IdentifierResult = { kind: 'did' | 'handle'; value: string } | { kind: 'invalid' };

/** Accepts "@alex.eurosky.social", "Alex.Eurosky.Social " or a DID. Emails are not supported. */
export function parseIdentifier(input: string): IdentifierResult {
  const value = input.trim().replace(/^@/, '');
  if (value.startsWith('did:'))
    return isValidDid(value) ? { kind: 'did', value } : { kind: 'invalid' };
  const handle = value.toLowerCase();
  return isValidHandle(handle) ? { kind: 'handle', value: handle } : { kind: 'invalid' };
}

export class IdentityError extends Error {
  constructor(readonly code: 'invalidIdentifier' | 'handleNotFound' | 'noPds') {
    super(code);
  }
}

/**
 * Finds the account's DID and PDS. A handle only counts as confirmed when the DID
 * document claims it back (bidirectional check), as in the atproto spec.
 */
export async function resolveAccount(
  input: string,
  resolver: IdentityResolver,
): Promise<ResolvedAccount> {
  const identifier = parseIdentifier(input);
  if (identifier.kind === 'invalid') throw new IdentityError('invalidIdentifier');

  const did =
    identifier.kind === 'did' ? identifier.value : await resolver.resolveHandle(identifier.value);
  if (!did) throw new IdentityError('handleNotFound');

  const doc = await resolver.resolveDid(did);
  if (!doc) throw new IdentityError('handleNotFound');
  if (identifier.kind === 'handle' && doc.handle?.toLowerCase() !== identifier.value) {
    throw new IdentityError('handleNotFound');
  }

  const pds = doc.pds ? safePdsOrigin(doc.pds) : undefined;
  if (!pds) throw new IdentityError('noPds');
  return { did, handle: doc.handle?.toLowerCase(), pds };
}

/** Only plain HTTPS origins on the default port; anything else is not a PDS we will call. */
function safePdsOrigin(endpoint: string): string | undefined {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
