import { describe, expect, it } from 'vitest';
import { parseOrganisationForm } from './organisation-form';

const now = new Date('2026-10-22T12:00:00.000Z');

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = {
  displayName: '  Hill Farm Animal Rescue ',
  locality: 'Utrecht',
  region: '',
  country: 'nl',
  preferred: 'email',
  email: 'adopt@hillfarm.example',
  website: '',
};

describe('parseOrganisationForm', () => {
  it('builds a valid org profile record, trimming and normalising', () => {
    expect(parseOrganisationForm(form(valid), now)).toEqual({
      ok: true,
      record: {
        displayName: 'Hill Farm Animal Rescue',
        location: { locality: 'Utrecht', country: 'NL' },
        contact: { preferred: 'email', email: 'adopt@hillfarm.example' },
        createdAt: '2026-10-22T12:00:00.000Z',
      },
    });
  });

  it('requires name, town and a real country', () => {
    const result = parseOrganisationForm(
      form({ ...valid, displayName: ' ', locality: '', country: 'XX' }),
      now,
    );
    expect(result).toMatchObject({
      ok: false,
      errors: { displayName: 'required', locality: 'required', country: 'required' },
    });
  });

  it('requires only the preferred contact method', () => {
    expect(parseOrganisationForm(form({ ...valid, email: '' }), now)).toMatchObject({
      ok: false,
      errors: { email: 'required' },
    });
    expect(parseOrganisationForm(form({ ...valid, preferred: 'bluesky', email: '' }), now).ok).toBe(
      true,
    );
    expect(
      parseOrganisationForm(form({ ...valid, preferred: 'website', website: '' }), now),
    ).toMatchObject({ ok: false, errors: { website: 'required' } });
  });

  it('rejects malformed emails and non-HTTPS websites', () => {
    expect(parseOrganisationForm(form({ ...valid, email: 'not-an-email' }), now)).toMatchObject({
      errors: { email: 'invalid' },
    });
    expect(
      parseOrganisationForm(form({ ...valid, website: 'http://hillfarm.example' }), now),
    ).toMatchObject({ errors: { website: 'invalid' } });
  });

  it('rejects names over 100 characters, counting emoji as one', () => {
    expect(parseOrganisationForm(form({ ...valid, displayName: '🐾'.repeat(100) }), now).ok).toBe(
      true,
    );
    expect(
      parseOrganisationForm(form({ ...valid, displayName: 'a'.repeat(101) }), now),
    ).toMatchObject({ errors: { displayName: 'tooLong' } });
  });

  it('falls back to email when the contact preference is tampered with', () => {
    const result = parseOrganisationForm(form({ ...valid, preferred: 'fax' }), now);
    expect(result).toMatchObject({ ok: true, record: { contact: { preferred: 'email' } } });
  });

  it('keeps what was typed when there are errors', () => {
    const result = parseOrganisationForm(form({ ...valid, locality: '' }), now);
    expect(result).toMatchObject({ ok: false, values: { displayName: 'Hill Farm Animal Rescue' } });
  });
});
