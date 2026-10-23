import { describe, expect, it } from 'vitest';
import { mergeProfile, parseOrganisationForm, profileToFormValues } from './organisation-form';

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
    expect(parseOrganisationForm(form(valid), { now })).toMatchObject({
      ok: true,
      record: {
        displayName: 'Hill Farm Animal Rescue',
        location: { locality: 'Utrecht', country: 'NL' },
        contact: { preferred: 'email', email: 'adopt@hillfarm.example' },
        createdAt: '2026-10-22T12:00:00.000Z',
      },
      values: { displayName: 'Hill Farm Animal Rescue', country: 'NL' },
    });
  });

  it('requires name, town and a real country', () => {
    const result = parseOrganisationForm(
      form({ ...valid, displayName: ' ', locality: '', country: 'XX' }),
      { now },
    );
    expect(result).toMatchObject({
      ok: false,
      errors: { displayName: 'required', locality: 'required', country: 'required' },
    });
  });

  it('requires only the preferred contact method', () => {
    expect(parseOrganisationForm(form({ ...valid, email: '' }), { now })).toMatchObject({
      ok: false,
      errors: { email: 'required' },
    });
    expect(
      parseOrganisationForm(form({ ...valid, preferred: 'bluesky', email: '' }), { now }).ok,
    ).toBe(true);
    expect(
      parseOrganisationForm(form({ ...valid, preferred: 'website', website: '' }), { now }),
    ).toMatchObject({ ok: false, errors: { website: 'required' } });
  });

  it('rejects malformed emails and non-HTTPS websites', () => {
    expect(parseOrganisationForm(form({ ...valid, email: 'not-an-email' }), { now })).toMatchObject(
      {
        errors: { email: 'invalid' },
      },
    );
    expect(
      parseOrganisationForm(form({ ...valid, website: 'http://hillfarm.example' }), { now }),
    ).toMatchObject({ errors: { website: 'invalid' } });
  });

  it('rejects names over 100 characters, counting emoji as one', () => {
    expect(
      parseOrganisationForm(form({ ...valid, displayName: '🐾'.repeat(100) }), { now }).ok,
    ).toBe(true);
    expect(
      parseOrganisationForm(form({ ...valid, displayName: 'a'.repeat(101) }), { now }),
    ).toMatchObject({ errors: { displayName: 'tooLong' } });
  });

  it('falls back to email when the contact preference is tampered with', () => {
    const result = parseOrganisationForm(form({ ...valid, preferred: 'fax' }), { now });
    expect(result).toMatchObject({ ok: true, record: { contact: { preferred: 'email' } } });
  });

  it('keeps what was typed when there are errors', () => {
    const result = parseOrganisationForm(form({ ...valid, locality: '' }), { now });
    expect(result).toMatchObject({ ok: false, values: { displayName: 'Hill Farm Animal Rescue' } });
  });

  it('includes the full profile: description, donations, charity, process', () => {
    const result = parseOrganisationForm(
      form({
        ...valid,
        description: 'We rehome rabbits and guinea pigs.',
        'donationUrl.0': 'https://hillfarm.example/give',
        'donationLabel.0': 'Monthly gift',
        'donationKind.0': 'recurring',
        'donationUrl.1': 'https://hillfarm.example/once',
        'donationKind.1': 'made-up',
        charityRegistry: 'ANBI',
        charityNumber: '123456789',
        charityUrl: 'https://www.belastingdienst.nl/anbi',
        adoptionProcess: 'Visit, home check, adopt.',
      }),
      { now },
    );
    expect(result).toMatchObject({
      ok: true,
      record: {
        description: 'We rehome rabbits and guinea pigs.',
        donationLinks: [
          { url: 'https://hillfarm.example/give', label: 'Monthly gift', kind: 'recurring' },
          { url: 'https://hillfarm.example/once', kind: 'oneOff' },
        ],
        charityRegistration: {
          registry: 'ANBI',
          number: '123456789',
          registerUrl: 'https://www.belastingdienst.nl/anbi',
        },
        adoptionProcess: 'Visit, home check, adopt.',
      },
    });
  });

  it('validates donation links and the charity registration', () => {
    const result = parseOrganisationForm(
      form({
        ...valid,
        'donationLabel.0': 'Give',
        'donationUrl.1': 'http://insecure.example',
        charityNumber: '123',
      }),
      { now },
    );
    expect(result).toMatchObject({
      ok: false,
      errors: {
        'donationUrl.0': 'required',
        'donationUrl.1': 'invalid',
        charityRegistry: 'required',
      },
    });
  });

  it('keeps the original creation time and adds coordinates when known', () => {
    const result = parseOrganisationForm(form(valid), {
      now,
      createdAt: '2025-01-01T00:00:00.000Z',
      coordinates: { latitude: '52.09', longitude: '5.12' },
    });
    expect(result).toMatchObject({
      ok: true,
      record: {
        createdAt: '2025-01-01T00:00:00.000Z',
        location: { locality: 'Utrecht', latitude: '52.09', longitude: '5.12' },
      },
    });
  });

  it('round-trips through the editor form values', () => {
    const first = parseOrganisationForm(
      form({ ...valid, 'donationUrl.0': 'https://x.example/give', 'donationKind.0': 'both' }),
      { now },
    );
    if (!first.ok) throw new Error('expected ok');
    const again = parseOrganisationForm(form(profileToFormValues(first.record)), {
      now,
      createdAt: first.record.createdAt,
    });
    expect(again.ok && again.record).toEqual(first.record);
  });

  it('counts long text in characters and bytes, and rejects URLs with spaces', () => {
    const result = parseOrganisationForm(
      form({
        ...valid,
        displayName: '👨‍👩‍👧‍👦'.repeat(50),
        charityRegistry: 'ANBI',
        charityNumber: '1'.repeat(65),
        website: 'https://hillfarm.example/a b',
      }),
      { now },
    );
    expect(result).toMatchObject({
      ok: false,
      errors: { displayName: 'tooLong', charityNumber: 'tooLong', website: 'invalid' },
    });
  });

  it('keeps fields the editor does not change when merging', () => {
    const parsed = parseOrganisationForm(form(valid), { now });
    if (!parsed.ok) throw new Error('expected ok');
    const avatar = { $type: 'blob', ref: 'x', mimeType: 'image/png', size: 1 };
    const existing = { ...parsed.record, description: 'Old text', avatar } as never;
    const merged = mergeProfile(existing, parsed.record);
    expect(merged).toEqual({ ...parsed.record, avatar });
    expect(merged).not.toHaveProperty('description');
  });
});
