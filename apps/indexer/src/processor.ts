import { jsonToLex } from '@atproto/lex';
import type { IndexStore } from '@homeward/db';
import { pet } from '@homeward/lexicons';
import type { JetstreamEvent } from './events';

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
}

export interface ProcessorDependencies {
  store: Pick<
    IndexStore,
    'upsertOrg' | 'upsertAnimal' | 'upsertListing' | 'deleteRecord' | 'deleteRepo' | 'updateHandle'
  >;
  /** DIDs that have anything in the index, so network-wide identity/account noise is cheap. */
  knownDids: Set<string>;
  /** Looks up an account's verified handle, if it can. */
  resolveHandle?: (did: string) => Promise<string | undefined>;
  log: Logger;
}

/**
 * Applies one Jetstream event to the index. Records are untrusted network input: anything
 * that fails lexicon validation is skipped (and logged), never stored.
 */
export async function processEvent(event: JetstreamEvent, deps: ProcessorDependencies) {
  const { store, knownDids, log } = deps;

  if (event.kind === 'identity') {
    if (knownDids.has(event.did) && event.identity.handle) {
      await store.updateHandle(event.did, event.identity.handle);
    }
    return;
  }

  if (event.kind === 'account') {
    // Deleted, taken down, suspended or deactivated: remove from the index. A reactivated
    // account comes back through backfill (#24) or its next edit.
    if (!event.account.active && knownDids.has(event.did)) {
      await store.deleteRepo(event.did);
      knownDids.delete(event.did);
      log.info('account removed from index', { did: event.did, status: event.account.status });
    }
    return;
  }

  const { commit, did } = event;
  const uri = `at://${did}/${commit.collection}/${commit.rkey}`;

  if (commit.operation === 'delete') {
    if (knownDids.has(did)) await store.deleteRecord(uri);
    return;
  }

  let value: unknown;
  try {
    value = jsonToLex(commit.record as Parameters<typeof jsonToLex>[0]);
  } catch {
    log.warn('unparseable record skipped', { uri });
    return;
  }

  switch (commit.collection) {
    case 'pet.homeward.org.profile': {
      if (commit.rkey !== 'self') return skip(uri, 'org profile must use rkey "self"', log);
      const parsed = pet.homeward.org.profile.$safeParse(value);
      if (!parsed.success) return skip(uri, parsed.reason.message, log);
      const handle = await deps.resolveHandle?.(did).catch(() => undefined);
      await store.upsertOrg(did, parsed.value, commit.cid, handle);
      knownDids.add(did);
      return;
    }
    case 'pet.homeward.animal': {
      const parsed = pet.homeward.animal.$safeParse(value);
      if (!parsed.success) return skip(uri, parsed.reason.message, log);
      await store.upsertAnimal(uri, parsed.value, commit.cid);
      knownDids.add(did);
      return;
    }
    case 'pet.homeward.listing': {
      const parsed = pet.homeward.listing.$safeParse(value);
      if (!parsed.success) return skip(uri, parsed.reason.message, log);
      await store.upsertListing(uri, parsed.value, commit.cid);
      knownDids.add(did);
      return;
    }
  }
}

function skip(uri: string, reason: string, log: Logger): void {
  log.warn('invalid record skipped', { uri, reason });
}
