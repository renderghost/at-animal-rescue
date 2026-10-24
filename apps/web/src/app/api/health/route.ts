import { databaseAnswers } from '@homeward/db';
import { getDb } from '@/server/db';
import { checkHealth } from '@/server/health';

export const dynamic = 'force-dynamic';

/** For the uptime monitor (#48): 200 when Homeward can serve, 503 otherwise. */
export async function GET(): Promise<Response> {
  const indexerUrl = process.env.INDEXER_HEALTH_URL;
  const health = await checkHealth({
    database: () => databaseAnswers(getDb()),
    ...(indexerUrl && {
      // An internal address from our own settings, so not through the SSRF-safe fetch.
      indexer: async () => (await fetch(indexerUrl, { cache: 'no-store' })).ok,
    }),
  });
  return Response.json(health, {
    status: health.status === 'ok' ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
