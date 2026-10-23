import type { DomainFact, OrgFactsStore, VerificationFact } from '@homeward/db';
import type { Logger } from './processor';

/** Handles under these belong to a hosting provider, so they say nothing about who runs them. */
export const DEFAULT_PROVIDER_SUFFIXES = ['bsky.social', 'eurosky.social'];

const VERIFICATION = 'app.bsky.graph.verification';
const DAY = 24 * 60 * 60 * 1000;

export function isProviderHandle(handle: string, suffixes: readonly string[]): boolean {
  const lower = handle.toLowerCase();
  return suffixes.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`));
}

export interface HandleLookups {
  /** The account's handle, only if it points back to the account (bidirectional). */
  verifiedHandle(did: string): Promise<string | undefined>;
  resolveDns(handle: string): Promise<string | undefined>;
  resolveHttp(handle: string): Promise<string | undefined>;
}

/**
 * Whether the organisation's handle is its own domain, and how the domain points back to
 * the account. Undefined when there's nothing to show (no verified handle, or a provider's).
 */
export async function checkDomain(
  did: string,
  lookups: HandleLookups,
  providerSuffixes: readonly string[],
): Promise<DomainFact | undefined> {
  const handle = await lookups.verifiedHandle(did);
  if (!handle || isProviderHandle(handle, providerSuffixes)) return undefined;
  if ((await lookups.resolveDns(handle)) === did) return { handle, method: 'dns' };
  if ((await lookups.resolveHttp(handle)) === did) return { handle, method: 'https' };
  return undefined;
}

export class AppViewError extends Error {}

export interface VerificationSources {
  appviewUrl: string;
  /** Verifiers we trust beyond Bluesky's own list (e.g. EU bodies), by DID. */
  extraVerifiers: readonly string[];
  /** Verification records issued by the extra verifiers, by subject DID. */
  extraRecords?: (verifier: string) => Promise<Map<string, VerificationRecord[]>>;
  fetch?: typeof globalThis.fetch;
}

export interface VerificationRecord {
  subject: string;
  handle: string;
  displayName: string;
  createdAt: string;
}

interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  verification?: {
    verifications?: Array<{ issuer: string; isValid: boolean; createdAt: string }>;
  };
}

/**
 * Valid verifications of the organisation's Bluesky account by trusted verifiers. Bluesky's
 * AppView lists those by the verifiers it trusts and says whether each is still valid (the
 * handle and display name haven't changed since). Extra verifiers are checked the same way.
 */
export async function checkVerifications(
  did: string,
  sources: VerificationSources,
): Promise<VerificationFact[]> {
  const fetch = sources.fetch ?? globalThis.fetch;
  const get = async <T>(method: string, params: URLSearchParams): Promise<T | undefined> => {
    const url = new URL(`/xrpc/${method}?${params}`, sources.appviewUrl);
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      throw new AppViewError(`AppView unreachable: ${String(err)}`);
    }
    // 400 means no such profile (e.g. the account has never used Bluesky): nothing to show.
    if (response.status === 400) return undefined;
    if (!response.ok) throw new AppViewError(`AppView responded ${response.status}`);
    return (await response.json()) as T;
  };

  const profile = await get<ProfileView>(
    'app.bsky.actor.getProfile',
    new URLSearchParams({ actor: did }),
  );
  if (!profile) return [];
  const found = (profile.verification?.verifications ?? [])
    .filter((v) => v.isValid)
    .map((v) => ({ issuer: v.issuer, createdAt: v.createdAt }));

  for (const verifier of sources.extraVerifiers) {
    if (found.some((v) => v.issuer === verifier)) continue;
    const records = (await sources.extraRecords?.(verifier))?.get(did) ?? [];
    // Valid only while the handle and display name are still those that were verified.
    const valid = records.find(
      (r) => r.handle === profile.handle && r.displayName === (profile.displayName ?? ''),
    );
    if (valid) found.push({ issuer: verifier, createdAt: valid.createdAt });
  }
  if (found.length === 0) return [];

  const params = new URLSearchParams();
  for (const v of found) params.append('actors', v.issuer);
  const issuers = await get<{ profiles: ProfileView[] }>('app.bsky.actor.getProfiles', params);
  return found.map((v) => {
    const issuer = issuers?.profiles.find((p) => p.did === v.issuer);
    return {
      ...v,
      ...(issuer?.handle && { issuerHandle: issuer.handle }),
      ...(issuer?.displayName && { issuerName: issuer.displayName }),
    };
  });
}

/**
 * Reads every verification record an extra verifier has issued, from its own repository,
 * cached for a few hours so each organisation's check doesn't page through them again.
 */
export function createExtraRecordsLoader({
  pdsOf,
  fetch = globalThis.fetch,
  ttlMs = 6 * 60 * 60 * 1000,
  maxPages = 50,
  now = Date.now,
}: {
  pdsOf: (did: string) => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
  ttlMs?: number;
  maxPages?: number;
  now?: () => number;
}) {
  const cache = new Map<string, { expires: number; records: Map<string, VerificationRecord[]> }>();
  return async (verifier: string) => {
    const cached = cache.get(verifier);
    if (cached && cached.expires > now()) return cached.records;
    const pds = await pdsOf(verifier);
    if (!pds) throw new Error(`No PDS for verifier ${verifier}`);
    const records = new Map<string, VerificationRecord[]>();
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        repo: verifier,
        collection: VERIFICATION,
        limit: '100',
      });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(new URL(`/xrpc/com.atproto.repo.listRecords?${params}`, pds), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`listRecords responded ${response.status}`);
      const body = (await response.json()) as {
        records: Array<{ value: Partial<VerificationRecord> }>;
        cursor?: string;
      };
      for (const { value } of body.records) {
        if (
          !value.subject ||
          !value.handle ||
          value.displayName === undefined ||
          !value.createdAt
        ) {
          continue;
        }
        const list = records.get(value.subject) ?? [];
        list.push(value as VerificationRecord);
        records.set(value.subject, list);
      }
      cursor = body.cursor;
      if (!cursor || body.records.length === 0) break;
    }
    cache.set(verifier, { expires: now() + ttlMs, records });
    return records;
  };
}

export interface FactCheckerDependencies {
  store: Pick<OrgFactsStore, 'saveDomain' | 'saveVerifications' | 'due'>;
  domain: (did: string) => Promise<DomainFact | undefined>;
  verifications: (did: string) => Promise<VerificationFact[]>;
  log: Logger;
  now?: () => Date;
}

/**
 * Checks organisations' facts when their profile or identity changes, and again daily.
 * Each fact is saved only when its check completed, so an outage never erases a fact.
 */
export class FactChecker {
  private readonly queued = new Set<string>();
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => Date;

  constructor(private readonly deps: FactCheckerDependencies) {
    this.now = deps.now ?? (() => new Date());
  }

  /** Checks one organisation now. */
  async check(did: string): Promise<void> {
    const { store, log } = this.deps;
    try {
      await store.saveDomain(did, await this.deps.domain(did), this.now());
    } catch (err) {
      log.warn('domain check failed; keeping the previous result', { did, error: String(err) });
    }
    try {
      await store.saveVerifications(did, await this.deps.verifications(did), this.now());
    } catch (err) {
      log.warn('verification check failed; keeping the previous result', {
        did,
        error: String(err),
      });
    }
  }

  /** Queues a check without blocking the caller (e.g. the Jetstream handler). */
  request(did: string): void {
    this.queued.add(did);
    this.kick();
  }

  /** Checks organisations whose facts are older than a day. */
  async checkDue(limit = 100): Promise<number> {
    const dids = await this.deps.store.due(new Date(this.now().getTime() - DAY), limit);
    for (const did of dids) this.request(did);
    await this.idle();
    return dids.length;
  }

  /** Re-checks stale facts every hour (each organisation about once a day). */
  start(intervalMs = 60 * 60 * 1000): void {
    const run = () =>
      this.checkDue().catch((err) =>
        this.deps.log.warn('scheduled fact check failed', { error: String(err) }),
      );
    this.timer = setInterval(run, intervalMs);
    void run();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.queued.clear();
    await this.idle();
  }

  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  private kick(): void {
    if (this.running) return;
    this.running = this.drain().finally(() => {
      this.running = undefined;
      // Anything requested while the last check was finishing.
      if (this.queued.size > 0) this.kick();
    });
  }

  private async drain(): Promise<void> {
    for (const did of this.queued) {
      this.queued.delete(did);
      await this.check(did);
    }
  }
}
