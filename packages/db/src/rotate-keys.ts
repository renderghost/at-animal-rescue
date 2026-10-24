import { createDb, keyringFromEnv } from './index';
import { type BlobAddress, PrivateBlobStore } from './private-blobs';
import { PostgresPrivateStore, type RecordAddress } from './private-store';

/**
 * Re-encrypts private records and files with PRIVATE_STORE_ACTIVE_KEY (#48). Run after
 * adding a new key and making it active. Once it reports no failures, the old key can be
 * removed: after 30 days, so sessions sealed with it have expired.
 */
async function rotate<C>(
  name: string,
  step: (cursor?: C) => Promise<{ rotated: number; failed: unknown[]; cursor?: C }>,
): Promise<number> {
  let rotated = 0;
  let failed = 0;
  let cursor: C | undefined;
  do {
    const result = await step(cursor);
    rotated += result.rotated;
    failed += result.failed.length;
    cursor = result.cursor;
  } while (cursor);
  console.log(JSON.stringify({ message: 'rotated', name, rotated, failed }));
  return failed;
}

const db = createDb();
const keyring = keyringFromEnv();
try {
  const records = new PostgresPrivateStore(db, keyring);
  const files = new PrivateBlobStore(db, keyring);
  const failed =
    (await rotate<RecordAddress>('private records', (cursor) => records.rotateKeys({ cursor }))) +
    (await rotate<BlobAddress>('private files', (cursor) => files.rotateKeys({ cursor })));
  process.exitCode = failed > 0 ? 1 : 0;
} finally {
  await db.close();
}
