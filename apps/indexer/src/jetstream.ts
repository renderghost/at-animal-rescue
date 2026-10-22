import type { JetstreamEvent } from './events';
import type { Logger } from './processor';

export interface CursorStore {
  load(): Promise<number | undefined>;
  save(cursor: number): Promise<void>;
}

export interface JetstreamOptions {
  url: string;
  collections: readonly string[];
  cursorStore: CursorStore;
  handle: (event: JetstreamEvent) => Promise<void>;
  log: Logger;
  /** Replay this much on reconnect; writes are idempotent, so replays are harmless. */
  rewindMicros?: number;
  saveEveryMs?: number;
  maxBackoffMs?: number;
}

export interface JetstreamStatus {
  connected: boolean;
  cursor?: number;
  lastEventAt?: Date;
  reconnects: number;
}

/**
 * Follows Jetstream for our collections. Events are handled one at a time, in order;
 * the cursor only advances past an event once it has been handled.
 */
export class JetstreamClient {
  private socket?: WebSocket;
  private queue: Promise<void> = Promise.resolve();
  /** Each connection gets a generation; events from an abandoned one are dropped. */
  private generation = 0;
  private stopped = false;
  private backoffMs = 1000;
  private saveTimer?: ReturnType<typeof setInterval>;
  private lastSaved?: number;
  readonly status: JetstreamStatus = { connected: false, reconnects: 0 };

  constructor(private readonly options: JetstreamOptions) {}

  async start(): Promise<void> {
    this.status.cursor = await this.options.cursorStore.load();
    this.saveTimer = setInterval(() => void this.saveCursor(), this.options.saveEveryMs ?? 5000);
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearInterval(this.saveTimer);
    this.socket?.close();
    await this.queue;
    await this.saveCursor();
  }

  /** The subscription URL, rewound slightly from the last handled event. */
  subscriptionUrl(): string {
    const url = new URL(this.options.url);
    for (const collection of this.options.collections) {
      url.searchParams.append('wantedCollections', collection);
    }
    if (this.status.cursor !== undefined) {
      const rewind = this.options.rewindMicros ?? 5_000_000;
      url.searchParams.set('cursor', String(Math.max(0, this.status.cursor - rewind)));
    }
    return url.toString();
  }

  private connect(): void {
    if (this.stopped) return;
    const generation = ++this.generation;
    const socket = new WebSocket(this.subscriptionUrl());
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.status.connected = true;
      this.backoffMs = 1000;
      this.options.log.info('connected to Jetstream', { cursor: this.status.cursor });
    });
    socket.addEventListener('message', (message) => {
      let event: JetstreamEvent;
      try {
        event = JSON.parse(String(message.data)) as JetstreamEvent;
      } catch {
        this.options.log.warn('unparseable Jetstream message skipped');
        return;
      }
      this.queue = this.queue.then(() => this.handle(event, generation));
    });
    socket.addEventListener('close', () => {
      if (generation !== this.generation) return;
      this.status.connected = false;
      this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      // A close event always follows; reconnection happens there.
    });
  }

  private scheduleReconnect(): void {
    this.status.connected = false;
    if (this.stopped) return;
    const delay = this.backoffMs + Math.floor(Math.random() * 250);
    this.backoffMs = Math.min(this.backoffMs * 2, this.options.maxBackoffMs ?? 60_000);
    this.status.reconnects++;
    this.options.log.warn('Jetstream disconnected; reconnecting', { delayMs: delay });
    setTimeout(() => this.connect(), delay);
  }

  private async handle(event: JetstreamEvent, generation: number): Promise<void> {
    // Anything still queued from a connection we gave up on is replayed after reconnecting.
    if (generation !== this.generation || this.stopped) return;
    try {
      await this.options.handle(event);
    } catch (err) {
      // Most likely the database. Don't advance: abandon this connection, so the reconnect
      // resumes from the last event that was handled, and this one is replayed.
      this.options.log.warn('event handling failed; will replay', {
        error: err instanceof Error ? err.message : String(err),
        time_us: event.time_us,
      });
      const socket = this.socket;
      this.generation++;
      socket?.close();
      this.scheduleReconnect();
      return;
    }
    this.status.cursor = event.time_us;
    this.status.lastEventAt = new Date();
  }

  private async saveCursor(): Promise<void> {
    const cursor = this.status.cursor;
    if (cursor === undefined || cursor === this.lastSaved) return;
    try {
      await this.options.cursorStore.save(cursor);
      this.lastSaved = cursor;
    } catch (err) {
      this.options.log.warn('could not save cursor', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
