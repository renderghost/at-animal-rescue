import { randomBytes } from 'node:crypto';
import { pet } from '@homeward/lexicons';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from './index';
import { IndexStore } from './index-store';
import { OrgFactsStore } from './org-facts';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(databaseUrl)('OrgFactsStore', () => {
  const db = createDb(databaseUrl);
  const index = new IndexStore(db);
  const facts = new OrgFactsStore(db);
  const dids: string[] = [];

  afterAll(async () => {
    for (const did of dids) await index.deleteRepo(did);
    await db.close();
  });

  async function seedOrg() {
    const did = `did:plc:facts${randomBytes(8).toString('hex')}`;
    dids.push(did);
    const record = pet.homeward.org.profile.$parse({
      $type: 'pet.homeward.org.profile',
      displayName: 'Hill Farm',
      location: { locality: 'Utrecht', country: 'NL' },
      contact: { preferred: 'email', email: 'a@b.example' },
      createdAt: '2026-10-01T12:00:00.000Z',
    });
    await index.upsertOrg(did, record, 'cid', 'hillfarm.org');
    return did;
  }

  it('saves each fact separately, with when it was checked', async () => {
    const did = await seedOrg();
    expect(await facts.get(did)).toBeUndefined();
    const checked = new Date('2026-10-23T08:00:00Z');
    await facts.saveDomain(did, { handle: 'hillfarm.org', method: 'dns' }, checked);
    expect(await facts.get(did)).toEqual({
      domain: { handle: 'hillfarm.org', method: 'dns' },
      domainCheckedAt: checked,
      verifications: [],
      verificationsCheckedAt: undefined,
    });

    const verification = { issuer: 'did:plc:bsky', issuerHandle: 'bsky.app', createdAt: 'x' };
    await facts.saveVerifications(did, [verification], checked);
    await facts.saveDomain(did, undefined, checked);
    expect(await facts.get(did)).toMatchObject({
      domainCheckedAt: checked,
      verifications: [verification],
      verificationsCheckedAt: checked,
    });
    expect(await facts.get(did)).not.toHaveProperty('domain');
  });

  it('lists organisations never checked or checked before a time', async () => {
    const fresh = await seedOrg();
    const stale = await seedOrg();
    const never = await seedOrg();
    const now = new Date();
    for (const did of [fresh, stale]) {
      const at = did === fresh ? now : new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      await facts.saveDomain(did, undefined, at);
      await facts.saveVerifications(did, [], at);
    }
    const due = await facts.due(new Date(now.getTime() - 24 * 60 * 60 * 1000), 1000);
    expect(due).toEqual(expect.arrayContaining([stale, never]));
    expect(due).not.toContain(fresh);
  });

  it('forgets an organisation’s facts when it leaves the index', async () => {
    const did = await seedOrg();
    await facts.saveDomain(did, { handle: 'hillfarm.org', method: 'https' });
    await index.deleteRecord(`at://${did}/pet.homeward.org.profile/self`);
    expect(await facts.get(did)).toBeUndefined();
  });
});
