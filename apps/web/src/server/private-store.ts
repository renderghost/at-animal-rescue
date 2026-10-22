import 'server-only';
import { PostgresPrivateStore } from '@homeward/db';
import { getDb, getKeyring } from './db';

export function getPrivateStore(): PostgresPrivateStore {
  return new PostgresPrivateStore(getDb(), getKeyring());
}
