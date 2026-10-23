import { eq, sql } from 'drizzle-orm';
import type { Db } from './index';
import { indexOrgs } from './schema';

export interface IndexedOrg {
  did: string;
  /** The handle, only once it has been verified both ways. */
  handle?: string;
  /** Approved by a moderator, so its listings are public (#43). */
  approved: boolean;
  /** The profile record in atproto JSON, as published (validate before use). */
  record: unknown;
}

/** An indexed organisation, by DID or by its verified handle (handles ignore case). */
export async function findOrg(
  db: Db,
  by: { did: string } | { handle: string },
): Promise<IndexedOrg | undefined> {
  const [row] = await db
    .select({
      did: indexOrgs.did,
      handle: indexOrgs.handle,
      approved: indexOrgs.trusted,
      record: indexOrgs.record,
    })
    .from(indexOrgs)
    .where(
      'did' in by
        ? eq(indexOrgs.did, by.did)
        : sql`lower(${indexOrgs.handle}) = lower(${by.handle})`,
    )
    .limit(1);
  return row && { ...row, handle: row.handle ?? undefined };
}
