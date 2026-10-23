import { describe, expect, it } from 'vitest';
import { contactLinks } from './contact';

const org = (preferred: string, extra: Record<string, string> = {}) => ({
  did: 'did:plc:hillfarm',
  handle: 'hillfarm.example',
  profile: { contact: { preferred, email: 'adopt@hillfarm.example', ...extra } } as never,
});
const labels = { email: 'Email', bluesky: 'Bluesky', website: 'Website' };

describe('contactLinks', () => {
  it('puts the preferred way first and fills in the email', () => {
    const { preferred, others } = contactLinks(
      org('email', { website: 'https://hillfarm.example' }),
      labels,
      {
        subject: 'Adoption enquiry: Bonnie & Clyde',
        body: 'See https://homeward.example/org/hillfarm.example/listings/3m5z2kq5qnsla?x=1\n',
      },
    );
    expect(preferred.key).toBe('email');
    const url = new URL(preferred.href);
    expect(url.protocol).toBe('mailto:');
    expect(preferred.href).not.toContain('+');
    expect(url.searchParams.get('subject')).toBe('Adoption enquiry: Bonnie & Clyde');
    expect(url.searchParams.get('body')).toContain('/listings/3m5z2kq5qnsla?x=1');
    expect(others.map((link) => link.key)).toEqual(['bluesky', 'website']);
  });

  it('falls back when the preferred way is missing', () => {
    const { preferred } = contactLinks(org('website'), labels, { subject: 'Hello' });
    expect(preferred).toMatchObject({ key: 'email' });
    const bluesky = contactLinks(org('bluesky'), labels, { subject: 'Hello' }).preferred;
    expect(bluesky.href).toBe('https://bsky.app/profile/hillfarm.example');
  });
});
