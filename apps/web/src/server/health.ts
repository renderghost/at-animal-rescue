export type ComponentHealth = 'ok' | 'down' | 'unchecked';

export interface Health {
  status: 'ok' | 'degraded';
  database: ComponentHealth;
  indexer: ComponentHealth;
}

const TIMEOUT_MS = 3000;

async function within<T>(check: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS);
  });
  try {
    return await Promise.race([check(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether Homeward can serve (#48), for the uptime monitor: the database answers and, where
 * configured, the indexer is connected to Jetstream. Each check gives up after 3 seconds.
 */
export async function checkHealth(checks: {
  database: () => Promise<unknown>;
  indexer?: () => Promise<boolean>;
}): Promise<Health> {
  const [database, indexer] = await Promise.all([
    within(checks.database).then(
      (): ComponentHealth => 'ok',
      (): ComponentHealth => 'down',
    ),
    checks.indexer
      ? within(checks.indexer).then(
          (up): ComponentHealth => (up ? 'ok' : 'down'),
          (): ComponentHealth => 'down',
        )
      : Promise.resolve<ComponentHealth>('unchecked'),
  ]);
  const status = database === 'ok' && indexer !== 'down' ? 'ok' : 'degraded';
  return { status, database, indexer };
}
