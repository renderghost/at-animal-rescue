import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './index';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

// Notices such as "extension already exists, skipping" are expected on re-runs.
const db = createDb(undefined, { onnotice: () => {} });
try {
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied.');
} finally {
  await db.close();
}
