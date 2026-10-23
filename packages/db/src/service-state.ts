import { eq, sql } from 'drizzle-orm';
import type { Db } from './index';
import { serviceState } from './schema';

/** Reads and writes small pieces of state for background services. */
export class ServiceStateStore {
  constructor(private readonly db: Db) {}

  async get(key: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ value: serviceState.value })
      .from(serviceState)
      .where(eq(serviceState.key, key))
      .limit(1);
    return row?.value;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db
      .insert(serviceState)
      .values({ key, value })
      .onConflictDoUpdate({ target: serviceState.key, set: { value, updatedAt: sql`now()` } });
  }
}
