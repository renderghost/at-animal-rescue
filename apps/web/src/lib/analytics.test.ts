import { describe, expect, it } from 'vitest';
import { redactPath } from './analytics';

describe('redactPath', () => {
  it('hides share link secrets, in paths and full URLs', () => {
    expect(redactPath('/share/abc123_-XYZ')).toBe('/share/[token]');
    expect(redactPath('https://homeward.example/share/abc123?x=1')).toBe(
      'https://homeward.example/share/[token]?x=1',
    );
    expect(redactPath('/org/hillfarm.example/listings/3m5z2kq5qns2l')).toBe(
      '/org/hillfarm.example/listings/3m5z2kq5qns2l',
    );
    expect(redactPath('')).toBe('');
  });
});
