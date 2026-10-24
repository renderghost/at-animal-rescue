import { getPds, IdResolver } from '@atproto/identity';
import {
  createDb,
  IndexStore,
  ListingReportStore,
  OrgFactsStore,
  schema,
  ServiceStateStore,
} from '@homeward/db';
import { INDEXED_COLLECTIONS } from './events';
import {
  checkDomain,
  checkVerifications,
  createExtraRecordsLoader,
  DEFAULT_PROVIDER_SUFFIXES,
  FactChecker,
} from './facts';
import { createHandleResolver } from './handles';
import { startHealthServer } from './health';
import { JetstreamClient } from './jetstream';
import { jsonLogger as log } from './log';
import { processEvent } from './processor';

const CURSOR_KEY = 'indexer.jetstream.cursor';

const db = createDb();
const store = new IndexStore(db);
const state = new ServiceStateStore(db);
const idResolver = new IdResolver({ timeout: 5000 });
const resolveHandle = createHandleResolver(idResolver);
const list = (value: string | undefined) =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// Checked facts for organisation pages (#29), when profiles or identities change and daily.
const providerSuffixes = list(process.env.HANDLE_PROVIDER_SUFFIXES) ?? DEFAULT_PROVIDER_SUFFIXES;
const extraRecords = createExtraRecordsLoader({
  pdsOf: async (did) => {
    const doc = await idResolver.did.resolve(did);
    return doc ? getPds(doc) : undefined;
  },
});
const facts = new FactChecker({
  store: new OrgFactsStore(db),
  domain: (did) =>
    checkDomain(
      did,
      {
        verifiedHandle: resolveHandle,
        resolveDns: (handle) => idResolver.handle.resolveDns(handle),
        resolveHttp: (handle) => idResolver.handle.resolveHttp(handle),
      },
      providerSuffixes,
    ),
  verifications: (did) =>
    checkVerifications(did, {
      appviewUrl: process.env.BSKY_APPVIEW_URL || 'https://public.api.bsky.app',
      extraVerifiers: list(process.env.EXTRA_VERIFIERS) ?? [],
      extraRecords,
    }),
  log,
});

// DIDs already in the index, so identity/account events for everyone else are ignored cheaply.
const knownDids = new Set(
  (await db.select({ did: schema.indexOrgs.did }).from(schema.indexOrgs)).map((row) => row.did),
);

const client = new JetstreamClient({
  url: process.env.JETSTREAM_URL ?? 'wss://jetstream2.us-east.bsky.network/subscribe',
  collections: INDEXED_COLLECTIONS,
  cursorStore: {
    load: async () => {
      const value = await state.get(CURSOR_KEY);
      return value === undefined ? undefined : Number(value);
    },
    save: (cursor) => state.set(CURSOR_KEY, String(cursor)),
  },
  handle: (event) =>
    processEvent(event, {
      store,
      knownDids,
      resolveHandle,
      onOrgChanged: (did) => facts.request(did),
      log,
    }),
  log,
});

// Reporters' names and emails go six months after the decision (#44); checked daily.
const reports = new ListingReportStore(db);
const eraseContacts = () =>
  reports.eraseExpiredContacts().then(
    (count) => count > 0 && log.info("erased reporters' contact details", { count }),
    (err) => log.warn("erasing reporters' contact details failed", { error: String(err) }),
  );
const housekeeping = setInterval(eraseContacts, 24 * 60 * 60 * 1000);
void eraseContacts();

const health = startHealthServer(Number(process.env.PORT ?? 8081), () => client.status);
await client.start();
facts.start();
log.info('indexer started', { knownOrganisations: knownDids.size });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    log.info('shutting down', { signal });
    await client.stop();
    await facts.stop();
    clearInterval(housekeeping);
    health.close();
    await db.close();
    process.exit(0);
  });
}
