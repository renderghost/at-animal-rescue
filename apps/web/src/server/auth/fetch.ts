import 'server-only';
import { safeFetchWrap } from '@atproto-labs/fetch-node';

/**
 * PDS endpoints come from user-controlled DID documents, so every call to one goes
 * through SSRF protection: no private IPs, no redirects to them, bounded responses.
 */
export const safeFetch = safeFetchWrap({ timeout: 10_000 }) as typeof globalThis.fetch;
