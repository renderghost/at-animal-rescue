import { describe, expect, it } from 'vitest';
import { emailFact } from './email-fact';

const confirmedAt = new Date('2026-10-01T09:00:00Z');
const confirmation = { email: 'adopt@hillfarm.org', confirmedAt };
const now = new Date('2026-10-23T09:00:00Z');

describe('emailFact', () => {
  it('shows the domain and when it was confirmed', () => {
    expect(emailFact({ confirmation, currentEmail: 'adopt@hillfarm.org', now })).toEqual({
      domain: 'hillfarm.org',
      confirmedAt,
      alsoHandle: false,
      alsoWebsite: false,
    });
  });

  it('says when the domain is also its own handle or its website', () => {
    expect(
      emailFact({
        confirmation,
        currentEmail: 'adopt@hillfarm.org',
        ownDomain: 'rescue.hillfarm.org',
        website: 'https://www.hillfarm.org/adopt',
        now,
      }),
    ).toMatchObject({ alsoHandle: true, alsoWebsite: true });
    expect(
      emailFact({
        confirmation,
        currentEmail: 'adopt@hillfarm.org',
        ownDomain: 'notahillfarm.org',
        website: 'https://hillfarm.org.example.net',
        now,
      }),
    ).toMatchObject({ alsoHandle: false, alsoWebsite: false });
  });

  it('has nothing to show once the email changes or a year has passed', () => {
    expect(emailFact({ confirmation, currentEmail: 'new@hillfarm.org', now })).toBeUndefined();
    expect(
      emailFact({
        confirmation,
        currentEmail: 'adopt@hillfarm.org',
        now: new Date('2027-10-02T09:00:00Z'),
      }),
    ).toBeUndefined();
    expect(emailFact({ currentEmail: 'adopt@hillfarm.org', now })).toBeUndefined();
  });
});
