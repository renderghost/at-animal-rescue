import type { Client } from '@atproto/lex';
import type { IndexStore } from '@homeward/db';
import { pet } from '@homeward/lexicons';

export interface WriteThroughDeps {
  store: Pick<IndexStore, 'upsertOrg' | 'upsertAnimal' | 'upsertListing' | 'deleteRecord'>;
  /** The account's handle, checked both ways, as the indexer does. */
  verifiedHandle(did: string): Promise<string | undefined>;
}

const SCHEMAS = {
  'pet.homeward.org.profile': pet.homeward.org.profile,
  'pet.homeward.animal': pet.homeward.animal,
  'pet.homeward.listing': pet.homeward.listing,
} as const;
type Indexed = keyof typeof SCHEMAS;
const isIndexed = (nsid: unknown): nsid is Indexed => typeof nsid === 'string' && nsid in SCHEMAS;

/** Indexes a record the app has just written, validated exactly as from the network. */
async function indexRecord(
  deps: WriteThroughDeps,
  did: string,
  nsid: Indexed,
  uri: string,
  input: object,
  cid: string,
) {
  const parsed = SCHEMAS[nsid].$safeParse({ $type: nsid, ...input });
  if (!parsed.success) return;
  if (nsid === 'pet.homeward.org.profile') {
    const handle = await deps.verifiedHandle(did).catch(() => undefined);
    await deps.store.upsertOrg(did, parsed.value as pet.homeward.org.profile.Main, cid, handle);
  } else if (nsid === 'pet.homeward.animal') {
    await deps.store.upsertAnimal(uri, parsed.value as pet.homeward.animal.Main, cid);
  } else {
    await deps.store.upsertListing(uri, parsed.value as pet.homeward.listing.Main, cid);
  }
}

/**
 * Write-through (#24): the client for the signed-in account's repository, which also puts
 * each Homeward record it writes or deletes into the index straight away, so people see
 * their changes without waiting for Jetstream. Best effort: if indexing fails, the write
 * still stands and the indexer catches up.
 */
export function withWriteThrough(client: Client, did: string, deps: WriteThroughDeps): Client {
  type Ns = { $nsid?: unknown };
  const put = async (ns: Ns, input: object, options?: { rkey?: string }) => {
    const out = await (client.put as (...args: unknown[]) => Promise<{ uri: string; cid: string }>)(
      ns,
      input,
      options,
    );
    if (isIndexed(ns.$nsid) && out.uri.startsWith(`at://${did}/`)) {
      await indexRecord(deps, did, ns.$nsid, out.uri, input, out.cid).catch((err) =>
        console.warn('Write-through indexing failed; the indexer will catch up', err),
      );
    }
    return out;
  };
  const remove = async (ns: Ns, options?: { rkey?: string }) => {
    const out = await (client.delete as (...args: unknown[]) => Promise<unknown>)(ns, options);
    if (isIndexed(ns.$nsid)) {
      await deps.store
        .deleteRecord(`at://${did}/${ns.$nsid}/${options?.rkey ?? 'self'}`)
        .catch((err) =>
          console.warn('Write-through unindexing failed; the indexer will catch up', err),
        );
    }
    return out;
  };
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'put') return put;
      if (prop === 'delete') return remove;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
