import { getHandle, IdResolver } from '@atproto/identity';

/**
 * Resolves a DID to its handle, but only if the handle points back to the same DID
 * (bidirectional check), so an organisation can't claim someone else's domain.
 */
export function createHandleResolver(idResolver = new IdResolver({ timeout: 5000 })) {
  return async (did: string): Promise<string | undefined> => {
    const doc = await idResolver.did.resolve(did);
    const handle = doc ? getHandle(doc) : undefined;
    if (!handle) return undefined;
    const back = await idResolver.handle.resolve(handle);
    return back === did ? handle.toLowerCase() : undefined;
  };
}
