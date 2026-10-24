'use server';

import { requireOrganisation } from '@/server/animals/current-org';
import { getPreferences } from '@/i18n/preferences';
import { requireAdmin } from '@/server/admin/admin';
import { publicListing } from '@/server/listing-page/public-listing';
import {
  describeListing,
  listingReports,
  mailDecision,
  mailReceipt,
  mailSecondLook,
  mailStatement,
} from '@/server/reports/reports';
import { siteOrigin } from '@/server/site';
import {
  isDsaCategory,
  isReportReason,
  looksLikeEmail,
  MAX_APPEAL,
  MAX_EXPLANATION,
  MAX_RECEIPTS_PER_HOUR,
  MAX_REPORTER_NAME,
  MAX_STATEMENT,
  parseListingUri,
} from '@/lib/reports';
import { redirect } from 'next/navigation';

export interface ReportValues {
  reason: string;
  explanation: string;
  name: string;
  email: string;
  goodFaith: boolean;
}

export type ReportProblem = 'required' | 'tooLong' | 'invalid';

export type ReportFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      /** The listing can't be reported any more: deleted, or already hidden. */
      unavailable?: true;
      problems: Partial<Record<keyof ReportValues, ReportProblem>>;
      values: ReportValues;
    }
  | { status: 'done'; reference: string; emailed: boolean };

/** Anyone can report a listing they can see (#44, DSA Art. 16); no account needed. */
export async function submitReport(
  _previous: ReportFormState,
  form: FormData,
): Promise<ReportFormState> {
  const values: ReportValues = {
    reason: String(form.get('reason') ?? ''),
    explanation: String(form.get('explanation') ?? '').trim(),
    name: String(form.get('name') ?? '').trim(),
    email: String(form.get('email') ?? '').trim(),
    goodFaith: form.get('goodFaith') === 'on',
  };
  const problems: Partial<Record<keyof ReportValues, ReportProblem>> = {};
  if (!isReportReason(values.reason)) problems.reason = 'required';
  if (!values.explanation) problems.explanation = 'required';
  else if (values.explanation.length > MAX_EXPLANATION) problems.explanation = 'tooLong';
  if (values.name.length > MAX_REPORTER_NAME) problems.name = 'tooLong';
  if (values.email && !looksLikeEmail(values.email)) problems.email = 'invalid';
  if (!values.goodFaith) problems.goodFaith = 'required';

  const { formatLocale: locale } = await getPreferences();
  const target = await publicListing(
    String(form.get('org') ?? ''),
    String(form.get('rkey') ?? ''),
    locale,
  );
  if (!target) return { status: 'error', unavailable: true, problems, values };
  if (Object.keys(problems).length > 0) return { status: 'error', problems, values };

  const store = listingReports();
  const report = await store.report({
    listingUri: target.uri,
    orgDid: target.org.did,
    reason: values.reason,
    explanation: values.explanation,
    reporterName: values.name || undefined,
    reporterEmail: values.email || undefined,
  });
  // Receipts go to any address typed in, so only a few an hour: the report is taken anyway.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (
    report.reporterEmail &&
    (await store.countFromEmail(report.reporterEmail, hourAgo)) <= MAX_RECEIPTS_PER_HOUR
  ) {
    await mailReceipt(report, target.title, `${await siteOrigin()}${target.path}`);
  }
  return { status: 'done', reference: report.reference, emailed: Boolean(report.reporterEmail) };
}

/** Back to the console with an error, opened at the form that needs fixing. */
function fail(error: string, action: string, target: string, anchor: string): never {
  redirect(
    `/admin?error=${error}&action=${action}&target=${encodeURIComponent(target)}#${encodeURIComponent(anchor)}`,
  );
}

function textOf(
  form: FormData,
  field: string,
  max: number,
  required: boolean,
  failWith: (error: 'noteRequired' | 'noteTooLong') => never,
): string {
  const text = String(form.get(field) ?? '').trim();
  if (required && !text) failWith('noteRequired');
  if (text.length > max) failWith('noteTooLong');
  return text;
}

async function titleOf(uri: string) {
  const { formatLocale: locale } = await getPreferences();
  return (await describeListing(uri, locale))?.title ?? uri;
}

/**
 * Hides a listing with a statement of reasons: every open report about it is decided, the
 * reporters are told, and the organisation gets the statement.
 */
export async function hideListingAction(form: FormData): Promise<void> {
  const moderator = await requireAdmin();
  const listing = parseListingUri(form.get('uri'));
  if (!listing) redirect('/admin');
  const anchor = `reported-${listing.uri}`;
  const category = String(form.get('category') ?? '');
  const ground = String(form.get('ground') ?? '');
  if (!isDsaCategory(category)) fail('categoryRequired', 'hide', listing.uri, anchor);
  if (ground !== 'illegal' && ground !== 'terms')
    fail('groundRequired', 'hide', listing.uri, anchor);
  const statement = textOf(form, 'statement', MAX_STATEMENT, true, (error) =>
    fail(error, 'hide', listing.uri, anchor),
  );

  const store = listingReports();
  const decided = await store.hide({
    listingUri: listing.uri,
    orgDid: listing.did,
    category: `STATEMENT_CATEGORY_${category}`,
    ground,
    statement,
    actorDid: moderator,
  });
  const title = await titleOf(listing.uri);
  const hide = await store.hideOf(listing.uri);
  await Promise.all([mailDecision(decided, 'hidden', title), hide && mailStatement(hide, title)]);
  redirect('/admin?done=hidden');
}

/** No action on one report, with the reason its reporter is told. */
export async function dismissReportAction(form: FormData): Promise<void> {
  const moderator = await requireAdmin();
  const id = String(form.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect('/admin');
  const note = textOf(form, 'note', MAX_STATEMENT, true, (error) =>
    fail(error, 'dismiss', id, `report-${id}`),
  );
  const dismissed = await listingReports().dismiss(id, moderator, note);
  if (dismissed) await mailDecision([dismissed], 'dismissed', await titleOf(dismissed.listingUri));
  redirect('/admin?done=dismissed');
}

/** The second look succeeds: the listing is public again. */
export async function reinstateListingAction(form: FormData): Promise<void> {
  const moderator = await requireAdmin();
  const listing = parseListingUri(form.get('uri'));
  if (!listing) redirect('/admin');
  const note = textOf(form, 'note', MAX_STATEMENT, false, (error) =>
    fail(error, 'reinstate', listing.uri, `appeal-${listing.uri}`),
  );
  if (await listingReports().reinstate(listing.uri, moderator, note || undefined)) {
    await mailSecondLook(listing.did, 'reinstated', await titleOf(listing.uri), note);
  }
  redirect('/admin?done=reinstated');
}

/** The second look keeps the listing hidden, with the reason the organisation is told. */
export async function upholdHideAction(form: FormData): Promise<void> {
  const moderator = await requireAdmin();
  const listing = parseListingUri(form.get('uri'));
  if (!listing) redirect('/admin');
  const note = textOf(form, 'note', MAX_STATEMENT, true, (error) =>
    fail(error, 'uphold', listing.uri, `appeal-${listing.uri}`),
  );
  if (await listingReports().uphold(listing.uri, moderator, note)) {
    await mailSecondLook(listing.did, 'upheld', await titleOf(listing.uri), note);
  }
  redirect('/admin?done=upheld');
}

/** The organisation asks for a second look at a hidden listing (DSA Art. 20), once. */
export async function appealHideAction(form: FormData): Promise<void> {
  const { did } = await requireOrganisation();
  const listing = parseListingUri(form.get('uri'));
  if (!listing || listing.did !== did) redirect('/organisation');
  const rkey = listing.uri.split('/').pop()!;
  const text = String(form.get('appeal') ?? '').trim();
  if (!text || text.length > MAX_APPEAL) {
    redirect(
      `/organisation?appealError=${text ? 'tooLong' : 'required'}&listing=${rkey}#hidden-${rkey}`,
    );
  }
  await listingReports().appeal(listing.uri, did, text);
  redirect(`/organisation?appealed=${rkey}#hidden-${rkey}`);
}
