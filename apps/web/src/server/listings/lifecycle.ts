import { toDatetimeString } from '@atproto/syntax';
import type { ListingRecord } from './listing-form';

export const PUBLIC_STATUSES = ['available', 'reserved', 'adopted', 'withdrawn'] as const;
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

/**
 * The status changes a published listing allows, by its current status (spec §2, Listing
 * status). Relisting and undoing an adoption are only allowed while the listing's animals
 * aren't in another open listing; the caller checks that.
 */
export const TRANSITIONS: Readonly<Record<string, readonly PublicStatus[]>> = {
  available: ['reserved', 'adopted', 'withdrawn'],
  reserved: ['available', 'adopted', 'withdrawn'],
  withdrawn: ['available'],
  adopted: ['available'],
};

export const isPublicStatus = (value: unknown): value is PublicStatus =>
  (PUBLIC_STATUSES as readonly unknown[]).includes(value);

export const canChange = (from: string, to: string): boolean =>
  TRANSITIONS[from]?.includes(to as PublicStatus) ?? false;

/** Changes that end a listing, or undo an adoption, are confirmed first. */
export const needsConfirmation = (from: string, to: string): boolean =>
  to === 'adopted' || to === 'withdrawn' || (from === 'adopted' && to === 'available');

const pad = (n: number) => String(n).padStart(2, '0');

/** A date as the form shows it (YYYY-MM-DD, UTC). */
export const isoDate = (date: Date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/**
 * The adoption date: today if none is given (at the current time), or an earlier day the
 * organisation chose, when catching up (at midday UTC, so it reads as that day anywhere in
 * Europe). Future dates and dates before 2000 are refused.
 */
export function parseAdoptedAt(input: string | undefined, now = new Date()): string | 'invalid' {
  const value = input?.trim();
  if (!value || value === isoDate(now)) return toDatetimeString(now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'invalid';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (isoDate(date) !== value || date > now || date.getUTCFullYear() < 2000) return 'invalid';
  return toDatetimeString(date);
}

/** The listing with its new status; the adoption date is kept only while it's adopted. */
export function withStatus(
  listing: ListingRecord,
  status: PublicStatus,
  adoptedAt?: string,
): ListingRecord {
  const { adoptedAt: _previous, ...rest } = listing;
  return status === 'adopted'
    ? ({ ...rest, status, adoptedAt: adoptedAt ?? listing.adoptedAt } as ListingRecord)
    : { ...rest, status };
}
