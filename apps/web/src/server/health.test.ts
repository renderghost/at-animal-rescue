import { describe, expect, it, vi } from 'vitest';
import { checkHealth } from './health';

describe('checkHealth', () => {
  it('is ok when the database answers and the indexer is up, or not checked', async () => {
    expect(await checkHealth({ database: async () => 1, indexer: async () => true })).toEqual({
      status: 'ok',
      database: 'ok',
      indexer: 'ok',
    });
    expect(await checkHealth({ database: async () => 1 })).toEqual({
      status: 'ok',
      database: 'ok',
      indexer: 'unchecked',
    });
  });

  it('is degraded when either is down', async () => {
    expect(
      await checkHealth({
        database: async () => {
          throw new Error('ECONNREFUSED');
        },
        indexer: async () => true,
      }),
    ).toMatchObject({ status: 'degraded', database: 'down', indexer: 'ok' });
    expect(
      await checkHealth({ database: async () => 1, indexer: async () => false }),
    ).toMatchObject({ status: 'degraded', indexer: 'down' });
  });

  it('gives up on a check that hangs', async () => {
    vi.useFakeTimers();
    const pending = checkHealth({ database: () => new Promise(() => {}) });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toMatchObject({ status: 'degraded', database: 'down' });
    vi.useRealTimers();
  });
});
