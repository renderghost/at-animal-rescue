import { describe, expect, it } from 'vitest';
import { scrubEvent } from './errors';

describe('scrubEvent', () => {
  it('keeps the error and route, and drops anything personal', () => {
    const event = scrubEvent({
      type: undefined,
      exception: { values: [{ type: 'Error', value: 'boom' }] },
      user: { ip_address: '203.0.113.7', id: 'did:plc:abc' },
      breadcrumbs: [{ message: 'fetch https://pds.example/xrpc/...' }],
      request: {
        url: 'https://homeward.example/share/secret-token?ref=email',
        method: 'GET',
        cookies: { hw_session: 'secret' },
        headers: { cookie: 'hw_session=secret' },
        data: { password: 'abcd-efgh' },
        query_string: 'ref=email',
      },
    });
    expect(event).toEqual({
      type: undefined,
      exception: { values: [{ type: 'Error', value: 'boom' }] },
      breadcrumbs: [],
      request: { url: 'https://homeward.example/share/[token]', method: 'GET' },
    });
  });
});
