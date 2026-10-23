import { createDb, IndexStore, schema, ServiceStateStore } from '@homeward/db';
import { INDEXED_COLLECTIONS } from './events';
import { createHandleResolver } from './handles';
import { startHealthServer } from './health';
import { JetstreamClient } from './jetstream';
import { jsonLogger as log } from './log';
import { processEvent } from './processor';

const CURSOR_KEY = 'indexer.jetstream.cursor';

const db = createDb();
const store = new IndexStore(db);
const state = new ServiceStateStore(db);

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
    processEvent(event, { store, knownDids, resolveHandle: createHandleResolver(), log }),
  log,
});

const health = startHealthServer(Number(process.env.PORT ?? 8081), () => client.status);
await client.start();
log.info('indexer started', { knownOrganisations: knownDids.size });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    log.info('shutting down', { signal });
    await client.stop();
    health.close();
    await db.close();
    process.exit(0);
  });
}
