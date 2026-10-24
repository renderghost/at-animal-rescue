import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export { schema };

export function createDb(
  url: string = requireDatabaseUrl(),
  options: Parameters<typeof postgres>[1] = {},
) {
  const client = postgres(url, options);
  return Object.assign(drizzle(client, { schema }), { close: () => client.end() });
}

export type Db = ReturnType<typeof createDb>;

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  return url;
}

export * from './crypto';
export * from './private-store';
export * from './private-blobs';
export * from './session-store';
export * from './index-store';
export * from './orgs';
export * from './photos';
export * from './org-facts';
export * from './email-confirmations';
export * from './search';
export * from './service-state';
export * from './share-links';
