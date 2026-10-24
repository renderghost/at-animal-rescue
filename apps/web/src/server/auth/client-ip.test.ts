import { describe, expect, it } from 'vitest';
import { addressBucket } from './client-ip';

describe('addressBucket', () => {
  it('keeps IPv4 addresses, including mapped ones', () => {
    expect(addressBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(addressBucket(' ::ffff:203.0.113.7 ')).toBe('203.0.113.7');
  });

  it('groups IPv6 addresses by their /64', () => {
    expect(addressBucket('2001:db8:85a3:12:8a2e:370:7334:1')).toBe('2001:db8:85a3:12::/64');
    expect(addressBucket('2001:db8:85a3:12::99')).toBe('2001:db8:85a3:12::/64');
    expect(addressBucket('[2001:0db8::1]')).toBe('2001:db8:0:0::/64');
    expect(addressBucket('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('refuses anything else', () => {
    expect(addressBucket('unknown')).toBeUndefined();
    expect(addressBucket('')).toBeUndefined();
    expect(addressBucket('1:2:3')).toBeUndefined();
  });
});
