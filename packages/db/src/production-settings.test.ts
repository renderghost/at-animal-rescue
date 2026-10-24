import { describe, expect, it } from 'vitest';
import { generateKey } from './crypto';
import { checkProductionSettings } from './production-settings';

const key = generateKey();
const settings = {
  DOMAIN: 'homeward.pet',
  SITE_URL: 'https://homeward.pet',
  ACME_EMAIL: 'ops@homeward.pet',
  POSTGRES_PASSWORD: 'b4f1c0de9a7e6d5c4b3a29180f7e6d5c',
  PRIVATE_STORE_KEYS: `k1:${key}`,
  PRIVATE_STORE_ACTIVE_KEY: 'k1',
  ADMIN_DIDS: 'did:plc:moderatorone, did:web:homeward.pet',
  TEM_PROJECT_ID: 'a1b2c3d4-0000-0000-0000-000000000000',
  TEM_SECRET_KEY: 'e5f6a7b8-0000-0000-0000-000000000000',
  EMAIL_FROM: 'Homeward <no-reply@homeward.pet>',
  NOMINATIM_CONTACT: 'ops@homeward.pet',
  JETSTREAM_URL: 'wss://jetstream2.us-east.bsky.network/subscribe',
  CLIENT_IP_HEADER: 'x-forwarded-for',
  ERRORS_DOMAIN: 'errors.homeward.pet',
  BUGSINK_SECRET_KEY: 'c2VjcmV0LWZvci1idWdzaW5rLXRoYXQtaXMtbG9uZw==',
  SENTRY_DSN_WEB: 'https://k@errors.homeward.pet/1',
  SENTRY_DSN_INDEXER: 'https://k@errors.homeward.pet/2',
  BACKUP_AGE_RECIPIENTS:
    'age1qyqszqgpqyqszqgpqyqszqgp age1zvkyg2lqzraa2lnjvqej32nkuu0ues2s82hzrye869xeexvn73equnujwj',
  BACKUP_REMOTE: 'backup:homeward-backups',
  RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID: 'SCWXXXXXXXXXXXXXXXXX',
  RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY: 'f0e1d2c3-0000-0000-0000-000000000000',
};

const check = (changes: Record<string, string | undefined>) =>
  checkProductionSettings({ ...settings, ...changes });

describe('checkProductionSettings', () => {
  it('passes complete settings', () => {
    expect(checkProductionSettings(settings)).toEqual({ problems: [], warnings: [] });
  });

  it('names every empty required setting with a hint', () => {
    const { problems } = check({ POSTGRES_PASSWORD: '', TEM_SECRET_KEY: undefined });
    expect(problems).toEqual([
      'POSTGRES_PASSWORD is empty. Make one with: openssl rand -hex 32',
      "TEM_SECRET_KEY is empty. It's the secret key of the Transactional Email API key.",
    ]);
  });

  it('catches values left from the template', () => {
    const { problems } = check({
      DOMAIN: 'homeward.example',
      SITE_URL: 'https://homeward.example',
      EMAIL_FROM: 'Homeward <no-reply@homeward.example>',
    });
    expect(problems).toEqual([
      'DOMAIN still has the example value from the template.',
      'SITE_URL still has the example value from the template.',
      'EMAIL_FROM still has the example value from the template.',
    ]);
    // A real domain that merely contains the word passes.
    expect(check({ NOMINATIM_CONTACT: 'ops@mail.example.org' }).problems).toEqual([]);
  });

  it('wants a bare domain and a matching https SITE_URL', () => {
    expect(check({ DOMAIN: 'https://homeward.pet' }).problems).toEqual([
      'DOMAIN is a name only, such as homeward.pet, without https:// or a slash.',
      'SITE_URL must be https://https://homeward.pet, to match DOMAIN.',
    ]);
    expect(check({ SITE_URL: 'http://homeward.pet' }).problems).toEqual([
      'SITE_URL must be https://homeward.pet, to match DOMAIN.',
    ]);
    expect(check({ SITE_URL: 'https://homeward.pet/' }).problems).toEqual([]);
  });

  it('refuses database passwords that would break the database address', () => {
    expect(check({ POSTGRES_PASSWORD: 'abc/def+ghi=jklmnopqrstu' }).problems[0]).toMatch(
      /^POSTGRES_PASSWORD may only use letters, digits/,
    );
    expect(check({ POSTGRES_PASSWORD: 'short' }).problems).toEqual([
      'POSTGRES_PASSWORD is too short. Make one with: openssl rand -hex 32',
    ]);
  });

  it('checks the keys without ever quoting one', () => {
    const missingId = check({ PRIVATE_STORE_KEYS: key }).problems;
    expect(missingId).toEqual(['PRIVATE_STORE_KEYS: write each key as id:key, such as k1:<key>.']);
    expect(check({ PRIVATE_STORE_KEYS: 'k1:dG9vLXNob3J0' }).problems).toEqual([
      'PRIVATE_STORE_KEYS: Key "k1" must be 32 bytes.',
    ]);
    expect(check({ PRIVATE_STORE_ACTIVE_KEY: 'k2' }).problems).toEqual([
      'PRIVATE_STORE_KEYS: Active key "k2" is not in the keyring.',
    ]);
    const all = [missingId, check({ PRIVATE_STORE_ACTIVE_KEY: 'k2' }).problems].flat();
    expect(all.join(' ')).not.toContain(key);
  });

  it('refuses the public development key', () => {
    const { problems } = check({
      PRIVATE_STORE_KEYS: `k1:${key},dev1:ZGV2LW9ubHktZG8tbm90LXVzZS1pbi1wcm9kdWN0aW8=`,
    });
    expect(problems).toEqual([
      'PRIVATE_STORE_KEYS holds the development key from .env.example, which is public. ' +
        'Make a new one with: openssl rand -base64 32',
    ]);
  });

  it('checks backup keys, Jetstream, Nominatim and moderators', () => {
    expect(check({ BACKUP_AGE_RECIPIENTS: 'age1abc,age1def' }).problems).toEqual([
      'BACKUP_AGE_RECIPIENTS: separate the keys with spaces, not commas.',
    ]);
    expect(check({ BACKUP_AGE_RECIPIENTS: 'ssh-ed25519 AAAA' }).problems).toEqual([
      'BACKUP_AGE_RECIPIENTS takes age public keys, which start with age1.',
    ]);
    expect(check({ JETSTREAM_URL: 'https://jetstream.example.org' }).problems).toEqual([
      'JETSTREAM_URL must start with wss://',
    ]);
    expect(check({ NOMINATIM_CONTACT: 'dev@localhost' }).problems).toEqual([
      'NOMINATIM_CONTACT is the development value: use a real email address.',
    ]);
    expect(check({ ADMIN_DIDS: 'did:plc:abc,alice.bsky.social' }).problems).toEqual([
      'ADMIN_DIDS takes DIDs (did:plc:...), not handles: alice.bsky.social. ' +
        'docs/DEPLOY.md says how to find yours.',
    ]);
  });

  it('warns about what still works but should be set', () => {
    const { problems, warnings } = check({
      ADMIN_DIDS: '',
      SENTRY_DSN_INDEXER: '',
      CLIENT_IP_HEADER: '',
    });
    expect(problems).toEqual([]);
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toMatch(/^ADMIN_DIDS is empty/);
  });
});
