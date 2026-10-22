import 'server-only';
import { createDb, keyringFromEnv, type Db, type Keyring } from '@homeward/db';

// One pool per server process; kept on globalThis so dev hot reloads don't leak pools.
const cache = globalThis as unknown as { homewardDb?: Db; homewardKeyring?: Keyring };

export function getDb(): Db {
  return (cache.homewardDb ??= createDb());
}

export function getKeyring(): Keyring {
  return (cache.homewardKeyring ??= keyringFromEnv());
}
