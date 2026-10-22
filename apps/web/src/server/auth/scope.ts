export type SessionScope = 'appPass' | 'appPassPrivileged' | 'full' | 'unknown';

/**
 * Reads the scope claim from a PDS access token. We only inspect a token the PDS just
 * gave us over TLS, so the signature is not verified here.
 */
export function sessionScope(accessJwt: string): SessionScope {
  try {
    const payload = accessJwt.split('.')[1];
    if (!payload) return 'unknown';
    const { scope } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      scope?: unknown;
    };
    switch (scope) {
      case 'com.atproto.appPass':
        return 'appPass';
      case 'com.atproto.appPassPrivileged':
        return 'appPassPrivileged';
      case 'com.atproto.access':
        return 'full';
      default:
        return 'unknown';
    }
  } catch {
    return 'unknown';
  }
}
