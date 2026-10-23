import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import type { JetstreamEvent } from './events';
import { JetstreamClient } from './jetstream';

const log = { info: vi.fn(), warn: vi.fn() };
const event = (time_us: number): JetstreamEvent => ({
  kind: 'identity',
  did: 'did:plc:x',
  time_us,
  identity: { did: 'did:plc:x', seq: time_us, time: '2026-10-22T00:00:00Z' },
});

let server: WebSocketServer | undefined;
let client: JetstreamClient | undefined;

afterEach(async () => {
  await client?.stop();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = client = undefined;
});

/** A fake Jetstream: records each connection's URL and lets the test drive it. */
async function fakeJetstream() {
  const connections: Array<{ url: URL; socket: WebSocket }> = [];
  server = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => server!.once('listening', resolve));
  server.on('connection', (socket, request) => {
    connections.push({ url: new URL(request.url!, 'ws://localhost'), socket });
  });
  const url = `ws://localhost:${(server.address() as AddressInfo).port}/subscribe`;
  const waitFor = async (count: number) => {
    await vi.waitFor(() => expect(connections.length).toBeGreaterThanOrEqual(count), {
      timeout: 5000,
    });
    return connections[count - 1]!;
  };
  return { url, connections, waitFor };
}

describe('JetstreamClient', () => {
  it('subscribes to our collections and handles events in order, saving the cursor', async () => {
    const fake = await fakeJetstream();
    const handled: number[] = [];
    const saved: number[] = [];
    client = new JetstreamClient({
      url: fake.url,
      collections: ['pet.homeward.listing', 'pet.homeward.animal'],
      cursorStore: { load: async () => undefined, save: async (c) => void saved.push(c) },
      handle: async (e) => {
        await new Promise((r) => setTimeout(r, 5 - (e.time_us % 3))); // uneven work
        handled.push(e.time_us);
      },
      log,
      saveEveryMs: 20,
    });
    await client.start();
    const first = await fake.waitFor(1);
    expect(first.url.searchParams.getAll('wantedCollections')).toEqual([
      'pet.homeward.listing',
      'pet.homeward.animal',
    ]);
    expect(first.url.searchParams.has('cursor')).toBe(false);

    for (const t of [10, 11, 12, 13]) first.socket.send(JSON.stringify(event(t)));
    first.socket.send('not json');
    await vi.waitFor(() => expect(handled).toEqual([10, 11, 12, 13]));
    await vi.waitFor(() => expect(saved.at(-1)).toBe(13));
  });

  it('reconnects with a slightly rewound cursor after the connection drops', async () => {
    const fake = await fakeJetstream();
    client = new JetstreamClient({
      url: fake.url,
      collections: ['pet.homeward.listing'],
      cursorStore: { load: async () => 50_000_000, save: async () => undefined },
      handle: async () => undefined,
      log,
      rewindMicros: 1_000_000,
    });
    await client.start();
    const first = await fake.waitFor(1);
    expect(first.url.searchParams.get('cursor')).toBe('49000000');
    first.socket.send(JSON.stringify(event(60_000_000)));
    await vi.waitFor(() => expect(client!.status.cursor).toBe(60_000_000));

    first.socket.close();
    const second = await fake.waitFor(2);
    expect(second.url.searchParams.get('cursor')).toBe('59000000');
    expect(client.status.reconnects).toBe(1);
  });

  it('replays an event whose handling failed, instead of skipping it', async () => {
    const fake = await fakeJetstream();
    const handled: number[] = [];
    let failOnce = true;
    client = new JetstreamClient({
      url: fake.url,
      collections: ['pet.homeward.listing'],
      cursorStore: { load: async () => undefined, save: async () => undefined },
      handle: async (e) => {
        if (e.time_us === 2 && failOnce) {
          failOnce = false;
          throw new Error('database down');
        }
        handled.push(e.time_us);
      },
      log,
      rewindMicros: 0,
    });
    await client.start();
    const first = await fake.waitFor(1);
    for (const t of [1, 2, 3]) first.socket.send(JSON.stringify(event(t)));

    // 3 must not be handled on the failed connection, and the cursor stays at 1.
    const second = await fake.waitFor(2);
    expect(handled).toEqual([1]);
    expect(second.url.searchParams.get('cursor')).toBe('1');

    // Jetstream replays from the cursor: 1 again (idempotent), then 2 and 3.
    for (const t of [1, 2, 3]) second.socket.send(JSON.stringify(event(t)));
    await vi.waitFor(() => expect(handled).toEqual([1, 1, 2, 3]));
  });
});
