import { getPds, IdResolver } from '@atproto/identity';
import { backfillRepo, createDb, pdsListRecords, schema } from '@homeward/db';
import { createHandleResolver } from './handles';
import { jsonLogger as log } from './log';

/**
 * Backfill (#24): brings the index in line with accounts' repositories, for recovery after
 * downtime or to add an account the indexer missed.
 *
 *   pnpm backfill <handle-or-did>...   those accounts
 *   pnpm backfill --known              every organisation already in the index
 */
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: pnpm backfill <handle-or-did>... | --known');
  process.exit(2);
}

const db = createDb();
const idResolver = new IdResolver({ timeout: 5000 });
const resolveHandle = createHandleResolver(idResolver);

const targets = args.includes('--known')
  ? (await db.select({ did: schema.indexOrgs.did }).from(schema.indexOrgs)).map((row) => row.did)
  : args;

let failed = 0;
for (const target of targets) {
  try {
    const did = target.startsWith('did:') ? target : await idResolver.handle.resolve(target);
    if (!did) throw new Error('handle not found');
    const doc = await idResolver.did.resolve(did);
    const pds = doc && getPds(doc);
    if (!pds) throw new Error('no PDS in the DID document');
    const handle = await resolveHandle(did).catch(() => undefined);
    const result = await backfillRepo(db, did, pdsListRecords(fetch, pds, did), handle);
    log.info('backfilled', { target, did, ...result });
  } catch (err) {
    failed++;
    log.warn('backfill failed; nothing changed for this account', { target, error: String(err) });
  }
}
await db.close();
process.exit(failed > 0 ? 1 : 0);
