import { eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from './index';
import { indexOrgs, orgFacts } from './schema';

export interface DomainFact {
  handle: string;
  method: 'dns' | 'https';
}

export interface VerificationFact {
  /** The verifier's DID. */
  issuer: string;
  issuerHandle?: string;
  issuerName?: string;
  /** When the verifier issued it. */
  createdAt: string;
}

export interface OrgFacts {
  domain?: DomainFact;
  domainCheckedAt?: Date;
  verifications: VerificationFact[];
  verificationsCheckedAt?: Date;
}

/** Checked facts about organisations (#29). */
export class OrgFactsStore {
  constructor(private readonly db: Db) {}

  async get(did: string): Promise<OrgFacts | undefined> {
    const [row] = await this.db.select().from(orgFacts).where(eq(orgFacts.did, did)).limit(1);
    if (!row) return undefined;
    return {
      ...(row.domainHandle &&
        row.domainMethod && {
          domain: { handle: row.domainHandle, method: row.domainMethod as DomainFact['method'] },
        }),
      domainCheckedAt: row.domainCheckedAt ?? undefined,
      verifications: row.verifications as VerificationFact[],
      verificationsCheckedAt: row.verificationsCheckedAt ?? undefined,
    };
  }

  /** Records the result of a domain check; undefined means there's no domain fact to show. */
  async saveDomain(
    did: string,
    fact: DomainFact | undefined,
    checkedAt = new Date(),
  ): Promise<void> {
    const values = {
      domainHandle: fact?.handle ?? null,
      domainMethod: fact?.method ?? null,
      domainCheckedAt: checkedAt,
    };
    await this.db
      .insert(orgFacts)
      .values({ did, ...values })
      .onConflictDoUpdate({ target: orgFacts.did, set: values });
  }

  async saveVerifications(
    did: string,
    verifications: VerificationFact[],
    checkedAt = new Date(),
  ): Promise<void> {
    const values = { verifications, verificationsCheckedAt: checkedAt };
    await this.db
      .insert(orgFacts)
      .values({ did, ...values })
      .onConflictDoUpdate({ target: orgFacts.did, set: values });
  }

  /** Indexed organisations whose facts are missing or were last checked before `before`. */
  async due(before: Date, limit = 100): Promise<string[]> {
    const rows = await this.db
      .select({ did: indexOrgs.did })
      .from(indexOrgs)
      .leftJoin(orgFacts, eq(orgFacts.did, indexOrgs.did))
      .where(
        or(
          isNull(orgFacts.domainCheckedAt),
          isNull(orgFacts.verificationsCheckedAt),
          lt(orgFacts.domainCheckedAt, before),
          lt(orgFacts.verificationsCheckedAt, before),
        ),
      )
      // Never-checked first, then the longest unchecked.
      .orderBy(
        sql`LEAST(${orgFacts.domainCheckedAt}, ${orgFacts.verificationsCheckedAt}) ASC NULLS FIRST`,
      )
      .limit(limit);
    return rows.map((row) => row.did);
  }

  async delete(did: string): Promise<void> {
    await this.db.delete(orgFacts).where(eq(orgFacts.did, did));
  }
}
