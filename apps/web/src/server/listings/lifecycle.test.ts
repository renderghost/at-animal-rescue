import { describe, expect, it } from 'vitest';
import { animalUri, mergeListing } from './listing-form';
import { canChange, needsConfirmation, parseAdoptedAt, withStatus } from './lifecycle';

const now = new Date('2026-10-23T15:30:00.000Z');

describe('status changes', () => {
  it('allows the agreed changes only', () => {
    expect(canChange('available', 'reserved')).toBe(true);
    expect(canChange('reserved', 'available')).toBe(true);
    expect(canChange('reserved', 'adopted')).toBe(true);
    expect(canChange('available', 'withdrawn')).toBe(true);
    expect(canChange('withdrawn', 'available')).toBe(true);
    expect(canChange('adopted', 'available')).toBe(true);
    expect(canChange('adopted', 'withdrawn')).toBe(false);
    expect(canChange('withdrawn', 'reserved')).toBe(false);
    expect(canChange('available', 'available')).toBe(false);
    expect(canChange('draft', 'available')).toBe(false);
    expect(canChange('something-new', 'available')).toBe(false);
  });

  it('confirms endings and undoing an adoption', () => {
    expect(needsConfirmation('available', 'adopted')).toBe(true);
    expect(needsConfirmation('reserved', 'withdrawn')).toBe(true);
    expect(needsConfirmation('adopted', 'available')).toBe(true);
    expect(needsConfirmation('available', 'reserved')).toBe(false);
    expect(needsConfirmation('withdrawn', 'available')).toBe(false);
  });
});

describe('parseAdoptedAt', () => {
  it('defaults to now, and takes an earlier day at midday', () => {
    expect(parseAdoptedAt(undefined, now)).toBe('2026-10-23T15:30:00.000Z');
    expect(parseAdoptedAt('2026-10-23', now)).toBe('2026-10-23T15:30:00.000Z');
    expect(parseAdoptedAt('2026-10-01', now)).toBe('2026-10-01T12:00:00.000Z');
  });

  it('refuses future, impossible and malformed dates', () => {
    expect(parseAdoptedAt('2026-10-24', now)).toBe('invalid');
    expect(parseAdoptedAt('2026-02-30', now)).toBe('invalid');
    expect(parseAdoptedAt('1999-12-31', now)).toBe('invalid');
    expect(parseAdoptedAt('23/10/2026', now)).toBe('invalid');
  });
});

describe('withStatus', () => {
  const listing = {
    ...mergeListing(undefined, { animals: [animalUri('did:plc:x', '3m5z2kq5qns2a')] }, undefined),
    status: 'available',
  };

  it('records the adoption date, and drops it when the adoption falls through', () => {
    const adopted = withStatus(listing, 'adopted', '2026-10-01T12:00:00.000Z');
    expect(adopted).toMatchObject({ status: 'adopted', adoptedAt: '2026-10-01T12:00:00.000Z' });
    const again = withStatus(adopted, 'available');
    expect(again.status).toBe('available');
    expect(again).not.toHaveProperty('adoptedAt');
  });
});
