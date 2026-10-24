import { parseKeyring } from './crypto';

/** The key published in .env.example for development, which anyone can read. */
const DEVELOPMENT_KEY = Buffer.from('ZGV2LW9ubHktZG8tbm90LXVzZS1pbi1wcm9kdWN0aW8=', 'base64');

export interface SettingsReport {
  /** Mistakes that would break the site, its email or its backups: the deploy stops. */
  problems: string[];
  /** Worth fixing, but the site works without. */
  warnings: string[];
}

const REQUIRED: Record<string, string> = {
  DOMAIN: "It's Homeward's address, such as homeward.pet.",
  SITE_URL: "It's https:// followed by DOMAIN.",
  POSTGRES_PASSWORD: 'Make one with: openssl rand -hex 32',
  PRIVATE_STORE_KEYS: 'Make a key with: openssl rand -base64 32, and write it as k1:<key>.',
  PRIVATE_STORE_ACTIVE_KEY: "It's the id of the key in use, such as k1.",
  TEM_PROJECT_ID: "It's the Scaleway project's ID, for Transactional Email.",
  TEM_SECRET_KEY: "It's the secret key of the Transactional Email API key.",
  EMAIL_FROM: 'Such as Homeward <no-reply@homeward.pet>, on the domain verified for email.',
  NOMINATIM_CONTACT: 'Use an email address OpenStreetMap can reach you on.',
  ERRORS_DOMAIN: "It's Bugsink's address, such as errors.homeward.pet.",
  BUGSINK_SECRET_KEY: 'Make one with: openssl rand -base64 50',
  BACKUP_AGE_RECIPIENTS: 'Put the age public keys (age1...) here, separated by spaces.',
  BACKUP_REMOTE: 'Such as backup:homeward-backups.',
  RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID: "It's the access key for the backup bucket.",
  RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY: "It's the secret key for the backup bucket.",
};

/** Addresses that are still the template's (.example is reserved and never real). */
const ADDRESSES = [
  'DOMAIN',
  'SITE_URL',
  'ACME_EMAIL',
  'EMAIL_FROM',
  'NOMINATIM_CONTACT',
  'ERRORS_DOMAIN',
  'ANALYTICS_DOMAIN',
];

const list = (value: string | undefined, separator: RegExp) =>
  (value ?? '').split(separator).filter(Boolean);

/**
 * Checks the server's .env (deploy/production.env.example) before a deploy changes anything,
 * so a mistake stops it with a plain message and the running version stays up.
 */
export function checkProductionSettings(env: NodeJS.ProcessEnv): SettingsReport {
  const problems: string[] = [];
  const warnings: string[] = [];
  const value = (name: string) => env[name]?.trim() ?? '';

  for (const [name, hint] of Object.entries(REQUIRED)) {
    if (!value(name)) problems.push(`${name} is empty. ${hint}`);
  }
  for (const name of ADDRESSES) {
    if (/\.example(?=$|[/:>\s])/i.test(value(name))) {
      problems.push(`${name} still has the example value from the template.`);
    }
  }

  for (const name of ['DOMAIN', 'ERRORS_DOMAIN']) {
    if (/[/:\s]/.test(value(name))) {
      problems.push(`${name} is a name only, such as homeward.pet, without https:// or a slash.`);
    }
  }
  const domain = value('DOMAIN');
  if (domain && value('SITE_URL').replace(/\/$/, '') !== `https://${domain}`) {
    problems.push(`SITE_URL must be https://${domain}, to match DOMAIN.`);
  }

  const password = value('POSTGRES_PASSWORD');
  if (password && !/^[\w-]+$/.test(password)) {
    problems.push(
      'POSTGRES_PASSWORD may only use letters, digits, - and _, as it goes into the ' +
        'database address. Make one with: openssl rand -hex 32',
    );
  } else if (password && password.length < 20) {
    problems.push('POSTGRES_PASSWORD is too short. Make one with: openssl rand -hex 32');
  }

  // Messages never quote a key: deploy logs end up on GitHub.
  if (!list(value('PRIVATE_STORE_KEYS'), /\s*,\s*/).every((entry) => /^[\w-]+:./.test(entry))) {
    problems.push('PRIVATE_STORE_KEYS: write each key as id:key, such as k1:<key>.');
  } else if (value('PRIVATE_STORE_KEYS') && value('PRIVATE_STORE_ACTIVE_KEY')) {
    try {
      const keyring = parseKeyring(value('PRIVATE_STORE_KEYS'), value('PRIVATE_STORE_ACTIVE_KEY'));
      if ([...keyring.keys.values()].some((key) => key.equals(DEVELOPMENT_KEY))) {
        problems.push(
          'PRIVATE_STORE_KEYS holds the development key from .env.example, which is public. ' +
            'Make a new one with: openssl rand -base64 32',
        );
      }
    } catch (error) {
      problems.push(`PRIVATE_STORE_KEYS: ${(error as Error).message}`);
    }
  }

  if (value('NOMINATIM_CONTACT') === 'dev@localhost') {
    problems.push('NOMINATIM_CONTACT is the development value: use a real email address.');
  }

  const recipients = value('BACKUP_AGE_RECIPIENTS');
  if (recipients.includes(',')) {
    problems.push('BACKUP_AGE_RECIPIENTS: separate the keys with spaces, not commas.');
  } else if (recipients && !list(recipients, /\s+/).every((key) => /^age1[0-9a-z]+$/.test(key))) {
    problems.push('BACKUP_AGE_RECIPIENTS takes age public keys, which start with age1.');
  }

  const jetstream = value('JETSTREAM_URL');
  if (jetstream && !jetstream.startsWith('wss://')) {
    problems.push('JETSTREAM_URL must start with wss://');
  }

  const admins = list(value('ADMIN_DIDS'), /\s*,\s*/);
  const notDids = admins.filter((entry) => !entry.startsWith('did:'));
  if (notDids.length > 0) {
    problems.push(
      `ADMIN_DIDS takes DIDs (did:plc:...), not handles: ${notDids.join(', ')}. ` +
        'docs/DEPLOY.md says how to find yours.',
    );
  } else if (admins.length === 0) {
    warnings.push(
      'ADMIN_DIDS is empty, so nobody can use /admin. Organisations need approving there ' +
        'before their listings are public.',
    );
  }
  if (!value('SENTRY_DSN_WEB') || !value('SENTRY_DSN_INDEXER')) {
    warnings.push('SENTRY_DSN_WEB or SENTRY_DSN_INDEXER is empty, so errors go unreported.');
  }
  if (!value('CLIENT_IP_HEADER')) {
    warnings.push(
      'CLIENT_IP_HEADER is empty, so sign-in limits count per account only. ' +
        'Set it to x-forwarded-for.',
    );
  }

  return { problems, warnings };
}
