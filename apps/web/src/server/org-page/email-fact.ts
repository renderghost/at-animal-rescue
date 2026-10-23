import { confirmationHolds, type EmailConfirmation } from '@homeward/db';

export interface EmailFact {
  /** Only the domain is shown; the address itself is in the contact details. */
  domain: string;
  confirmedAt: Date;
  /** The email domain is also the organisation's own (checked) handle domain. */
  alsoHandle: boolean;
  /** The email domain is also the domain of the website the organisation lists. */
  alsoWebsite: boolean;
}

/** The same domain, or one inside the other (adopt@hillfarm.org and rescue.hillfarm.org). */
function related(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function hostOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The confirmed-email fact for an organisation page, if its confirmation still counts:
 * for the current contact email, within a year (spec §2, Transparency).
 */
export function emailFact({
  confirmation,
  currentEmail,
  ownDomain,
  website,
  now = new Date(),
}: {
  confirmation?: EmailConfirmation;
  currentEmail?: string;
  /** The handle, only when it's been checked as the organisation's own domain. */
  ownDomain?: string;
  website?: string;
  now?: Date;
}): EmailFact | undefined {
  if (!confirmationHolds(confirmation, currentEmail, now)) return undefined;
  const domain = confirmation.email.split('@')[1];
  if (!domain) return undefined;
  const site = hostOf(website);
  return {
    domain,
    confirmedAt: confirmation.confirmedAt,
    alsoHandle: Boolean(ownDomain && related(domain, ownDomain.toLowerCase())),
    alsoWebsite: Boolean(site && related(domain, site)),
  };
}
