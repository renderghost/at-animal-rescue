import { createHash } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Resized public photos on the server's disk (#26), capped in size: the least recently
 * used are removed first. Everything here can be rebuilt from the PDS, so it can be wiped.
 */
export class ImageCache {
  private writtenSincePrune = Infinity;
  private pruning: Promise<void> | undefined;

  constructor(
    private readonly dir: string,
    private readonly maxBytes: number,
  ) {}

  private path(key: string) {
    const hash = createHash('sha256').update(key).digest('hex');
    return join(this.dir, hash.slice(0, 2), `${hash}.bin`);
  }

  async get(key: string): Promise<Buffer | undefined> {
    const path = this.path(key);
    try {
      const bytes = await readFile(path);
      // Reading counts as use, so popular photos stay.
      const now = new Date();
      await utimes(path, now, now).catch(() => {});
      return bytes;
    } catch {
      return undefined;
    }
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const path = this.path(key);
    await mkdir(join(path, '..'), { recursive: true });
    // Written beside it, then renamed, so a reader never sees half a file.
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, path);
    this.writtenSincePrune += bytes.length;
    if (this.writtenSincePrune > this.maxBytes / 20) {
      this.writtenSincePrune = 0;
      this.pruning ??= this.prune().finally(() => (this.pruning = undefined));
    }
  }

  async delete(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => unlink(this.path(key)).catch(() => {})));
  }

  /** Removes the least recently used files until the cache is within 90% of its cap. */
  async prune(): Promise<void> {
    const files: Array<{ path: string; size: number; used: number }> = [];
    let total = 0;
    for (const sub of await readdir(this.dir).catch(() => [] as string[])) {
      for (const name of await readdir(join(this.dir, sub)).catch(() => [] as string[])) {
        const path = join(this.dir, sub, name);
        const info = await stat(path).catch(() => undefined);
        if (!info?.isFile()) continue;
        files.push({ path, size: info.size, used: info.mtimeMs });
        total += info.size;
      }
    }
    if (total <= this.maxBytes) return;
    files.sort((a, b) => a.used - b.used);
    for (const file of files) {
      if (total <= this.maxBytes * 0.9) break;
      await unlink(file.path).catch(() => {});
      total -= file.size;
    }
  }
}
