import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface Keyring {
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

export interface Sealed {
  keyId: string;
  iv: Buffer;
  /** Ciphertext followed by the 16-byte GCM authentication tag. */
  data: Buffer;
}

/**
 * Parses keys from env: PRIVATE_STORE_KEYS="id1:base64,id2:base64" and
 * PRIVATE_STORE_ACTIVE_KEY="id2". Old keys stay listed so existing rows can still be
 * read while they are re-encrypted with the active key.
 */
export function keyringFromEnv(env: NodeJS.ProcessEnv = process.env): Keyring {
  const spec = env.PRIVATE_STORE_KEYS;
  const activeKeyId = env.PRIVATE_STORE_ACTIVE_KEY;
  if (!spec || !activeKeyId) {
    throw new Error('PRIVATE_STORE_KEYS and PRIVATE_STORE_ACTIVE_KEY must be set.');
  }
  return parseKeyring(spec, activeKeyId);
}

export function parseKeyring(spec: string, activeKeyId: string): Keyring {
  const keys = new Map<string, Buffer>();
  for (const entry of spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const separator = entry.indexOf(':');
    const id = entry.slice(0, separator);
    const key = Buffer.from(entry.slice(separator + 1), 'base64');
    if (separator < 1 || !/^[\w-]+$/.test(id)) throw new Error(`Invalid key id in "${id}".`);
    if (key.length !== KEY_BYTES) throw new Error(`Key "${id}" must be ${KEY_BYTES} bytes.`);
    if (keys.has(id)) throw new Error(`Duplicate key id "${id}".`);
    keys.set(id, key);
  }
  if (!keys.has(activeKeyId)) throw new Error(`Active key "${activeKeyId}" is not in the keyring.`);
  return { activeKeyId, keys };
}

/** Generates a key for PRIVATE_STORE_KEYS. */
export function generateKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}

/**
 * Encrypts with the active key. The associated data binds the ciphertext to its
 * location (owner, collection, record key), so a row copied elsewhere won't decrypt.
 */
export function seal(keyring: Keyring, plaintext: Buffer, associatedData: string): Sealed {
  const key = keyring.keys.get(keyring.activeKeyId)!;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const data = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { keyId: keyring.activeKeyId, iv, data };
}

export function open(keyring: Keyring, sealed: Sealed, associatedData: string): Buffer {
  const key = keyring.keys.get(sealed.keyId);
  if (!key) throw new Error(`Unknown key id "${sealed.keyId}".`);
  const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
  decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  decipher.setAuthTag(sealed.data.subarray(sealed.data.length - TAG_BYTES));
  return Buffer.concat([
    decipher.update(sealed.data.subarray(0, sealed.data.length - TAG_BYTES)),
    decipher.final(),
  ]);
}
