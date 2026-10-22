import { describe, expect, it } from 'vitest';
import { generateKey, open, parseKeyring, seal } from './crypto';

const k1 = generateKey();
const k2 = generateKey();
const aad = 'did:plc:abc\npet.homeward.adopter.household\nself';

describe('seal and open', () => {
  const keyring = parseKeyring(`k1:${k1}`, 'k1');

  it('round-trips plaintext', () => {
    const sealed = seal(keyring, Buffer.from('hello'), aad);
    expect(open(keyring, sealed, aad).toString()).toBe('hello');
  });

  it('uses a fresh IV every time', () => {
    const a = seal(keyring, Buffer.from('same'), aad);
    const b = seal(keyring, Buffer.from('same'), aad);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.data.equals(b.data)).toBe(false);
  });

  it('rejects ciphertext moved to another location', () => {
    const sealed = seal(keyring, Buffer.from('hello'), aad);
    expect(() => open(keyring, sealed, aad.replace('abc', 'xyz'))).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const sealed = seal(keyring, Buffer.from('hello'), aad);
    sealed.data[0] = (sealed.data[0] ?? 0) ^ 0xff;
    expect(() => open(keyring, sealed, aad)).toThrow();
  });

  it('opens rows sealed with an older key after rotation', () => {
    const before = seal(keyring, Buffer.from('old'), aad);
    const rotated = parseKeyring(`k1:${k1},k2:${k2}`, 'k2');
    expect(open(rotated, before, aad).toString()).toBe('old');
    expect(seal(rotated, Buffer.from('new'), aad).keyId).toBe('k2');
  });

  it('fails clearly for an unknown key id', () => {
    const sealed = seal(keyring, Buffer.from('hello'), aad);
    const other = parseKeyring(`k2:${k2}`, 'k2');
    expect(() => open(other, sealed, aad)).toThrow('Unknown key id "k1"');
  });
});

describe('parseKeyring', () => {
  it('rejects keys that are not 32 bytes', () => {
    expect(() => parseKeyring('k1:c2hvcnQ=', 'k1')).toThrow('32 bytes');
  });

  it('rejects an active key that is not in the ring', () => {
    expect(() => parseKeyring(`k1:${k1}`, 'k2')).toThrow('not in the keyring');
  });

  it('rejects duplicate and malformed ids', () => {
    expect(() => parseKeyring(`k1:${k1},k1:${k2}`, 'k1')).toThrow('Duplicate');
    expect(() => parseKeyring(`:${k1}`, 'k1')).toThrow('Invalid key id');
  });
});
