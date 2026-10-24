import { isValidDid, isValidTid } from '@atproto/syntax';

/** Why someone reports a listing (#44): six plain reasons. */
export const REPORT_REASONS = [
  'welfare',
  'illegalSale',
  'scam',
  'personalData',
  'otherIllegal',
  'rules',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * The categories of the EU's DSA transparency database, which statements of reasons are
 * filed under (without the STATEMENT_CATEGORY_ prefix).
 */
export const DSA_CATEGORIES = [
  'ANIMAL_WELFARE',
  'DATA_PROTECTION_AND_PRIVACY_VIOLATIONS',
  'ILLEGAL_OR_HARMFUL_SPEECH',
  'INTELLECTUAL_PROPERTY_INFRINGEMENTS',
  'NEGATIVE_EFFECTS_ON_CIVIC_DISCOURSE_OR_ELECTIONS',
  'NON_CONSENSUAL_BEHAVIOUR',
  'PORNOGRAPHY_OR_SEXUALIZED_CONTENT',
  'PROTECTION_OF_MINORS',
  'RISK_FOR_PUBLIC_SECURITY',
  'SCAMS_AND_FRAUD',
  'SELF_HARM',
  'SCOPE_OF_PLATFORM_SERVICE',
  'UNSAFE_AND_ILLEGAL_PRODUCTS',
  'VIOLENCE',
] as const;
export type DsaCategory = (typeof DSA_CATEGORIES)[number];

/** The category a moderator starts from; "other illegal content" needs their choice. */
export const REASON_CATEGORY: Record<ReportReason, DsaCategory | undefined> = {
  welfare: 'ANIMAL_WELFARE',
  illegalSale: 'ANIMAL_WELFARE',
  scam: 'SCAMS_AND_FRAUD',
  personalData: 'DATA_PROTECTION_AND_PRIVACY_VIOLATIONS',
  otherIllegal: undefined,
  rules: 'SCOPE_OF_PLATFORM_SERVICE',
};

/** The ground a moderator starts from: against the law, or against Homeward's rules. */
export const REASON_GROUND: Record<ReportReason, 'illegal' | 'terms'> = {
  welfare: 'terms',
  illegalSale: 'illegal',
  scam: 'illegal',
  personalData: 'illegal',
  otherIllegal: 'illegal',
  rules: 'terms',
};

export const isReportReason = (value: unknown): value is ReportReason =>
  (REPORT_REASONS as readonly unknown[]).includes(value);

export const isDsaCategory = (value: unknown): value is DsaCategory =>
  (DSA_CATEGORIES as readonly unknown[]).includes(value);

export const MAX_EXPLANATION = 2000;
export const MAX_REPORTER_NAME = 100;
export const MAX_STATEMENT = 2000;
export const MAX_APPEAL = 2000;
/** Receipts to one email address per hour, so the form can't be used to flood an inbox. */
export const MAX_RECEIPTS_PER_HOUR = 5;

/** Loose on purpose: the address only receives the outcome, so a typo costs the reporter. */
export const looksLikeEmail = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** A listing's AT URI from a form, or undefined if it isn't one. */
export function parseListingUri(value: unknown): { uri: string; did: string } | undefined {
  const match = /^at:\/\/(did:[^/]+)\/pet\.homeward\.listing\/([^/]+)$/.exec(String(value ?? ''));
  if (!match || !isValidDid(match[1]!) || !isValidTid(match[2]!)) return undefined;
  return { uri: match[0], did: match[1]! };
}
