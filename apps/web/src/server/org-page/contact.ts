import type { PublicOrg } from './org';

export interface ContactLink {
  key: 'email' | 'bluesky' | 'website';
  href: string;
  label: string;
}

/**
 * How to reach an organisation: its preferred way first (spec §2, Organisation page). An
 * email opens with the given subject and body filled in.
 */
export function contactLinks(
  org: Pick<PublicOrg, 'did' | 'handle' | 'profile'>,
  labels: Record<ContactLink['key'], string>,
  email: { subject: string; body?: string },
): { preferred: ContactLink; others: ContactLink[] } {
  const { contact } = org.profile;
  const query = new URLSearchParams({
    subject: email.subject,
    ...(email.body && { body: email.body }),
  })
    .toString()
    // mailto: wants %20 for spaces; URLSearchParams writes +.
    .replace(/\+/g, '%20');
  const links = [
    contact.email && {
      key: 'email',
      href: `mailto:${contact.email}?${query}`,
      label: labels.email,
    },
    {
      key: 'bluesky',
      href: `https://bsky.app/profile/${org.handle ?? org.did}`,
      label: labels.bluesky,
    },
    contact.website && { key: 'website', href: contact.website, label: labels.website },
  ].filter((link): link is ContactLink => Boolean(link));
  const preferred = links.find((link) => link.key === contact.preferred) ?? links[0]!;
  return { preferred, others: links.filter((link) => link !== preferred) };
}
