import { headers } from 'next/headers';

/**
 * The address to count sign-ins against (#67): IPv4 as it is, IPv6 by its /64 network,
 * since one connection usually has a whole /64 to hop around in.
 */
export function addressBucket(value: string): string | undefined {
  const address = value
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/%.*$/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return address;
  const mapped = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return mapped[1];
  if (!address.includes(':') || !/^[0-9a-f:]+$/i.test(address)) return undefined;
  const [head = '', tail = ''] = address.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = address.includes('::')
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : left;
  if (groups.length !== 8) return undefined;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/**
 * The client's address as our reverse proxy saw it (#47), read from the header named in
 * CLIENT_IP_HEADER (e.g. x-forwarded-for). Without that setting nothing is trusted, since
 * anyone can send the header. The last address is the one our proxy added.
 */
export async function clientAddress(): Promise<string | undefined> {
  const name = process.env.CLIENT_IP_HEADER;
  if (!name) return undefined;
  const value = (await headers()).get(name);
  const last = value?.split(',').pop();
  return last ? addressBucket(last) : undefined;
}
