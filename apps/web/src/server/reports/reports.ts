import 'server-only';
import { getListing, type ListingHide, type ListingReport, ListingReportStore } from '@homeward/db';
import { getTranslations } from 'next-intl/server';
import { mailOrg } from '../admin/admin';
import { getDb } from '../db';
import { listingTitle, type ListingRecord } from '../listings/listing-form';
import { sendMail } from '../mail';

export function listingReports() {
  return new ListingReportStore(getDb());
}

export interface ReportedListing {
  uri: string;
  did: string;
  rkey: string;
  title: string;
  path: string;
  orgName: string;
}

/** A listing's title and page from the index, for moderators and emails; gone once deleted. */
export async function describeListing(
  uri: string,
  locale: string,
): Promise<ReportedListing | undefined> {
  const row = await getListing(getDb(), uri);
  if (!row) return undefined;
  const rkey = uri.split('/').pop()!;
  const record = (row.record ?? {}) as { title?: unknown; animals?: unknown };
  const names = row.animals.map((animal) => ({
    rkey: animal.uri.split('/').pop()!,
    name: animal.name,
  }));
  const title = listingTitle(
    row.did,
    {
      title: typeof record.title === 'string' ? record.title : undefined,
      animals: (Array.isArray(record.animals) ? record.animals : []) as ListingRecord['animals'],
    },
    names,
    locale,
  );
  return {
    uri,
    did: row.did,
    rkey,
    title,
    path: `/org/${encodeURIComponent(row.org.handle ?? row.did)}/listings/${rkey}`,
    orgName: row.org.displayName,
  };
}

/** Best effort: a mail failure never undoes a report or a decision. */
async function mailReporter(report: ListingReport, subject: string, text: string) {
  if (!report.reporterEmail) return;
  try {
    await sendMail({ to: report.reporterEmail, subject, text });
  } catch (err) {
    console.warn('Could not email the reporter', err);
  }
}

/** Confirms a report was received, when the reporter gave an email address (DSA Art. 16). */
export async function mailReceipt(report: ListingReport, title: string, url: string) {
  const t = await getTranslations('ReportEmail');
  const reasons = await getTranslations('Report.reasons');
  await mailReporter(
    report,
    t('receipt.subject', { reference: report.reference }),
    t('receipt.body', {
      reference: report.reference,
      title,
      url,
      reason: reasons(`${report.reason}.label` as never),
    }),
  );
}

/** Tells reporters what was decided and why. */
export async function mailDecision(
  reports: ListingReport[],
  decision: 'hidden' | 'dismissed',
  title: string,
) {
  const t = await getTranslations('ReportEmail');
  await Promise.all(
    reports.map((report) =>
      mailReporter(
        report,
        t(`${decision}.subject`, { reference: report.reference }),
        t(`${decision}.body`, {
          reference: report.reference,
          title,
          reason: report.decisionNote ?? '',
        }),
      ),
    ),
  );
}

/** The statement of reasons to the organisation (DSA Art. 17); its dashboard shows it too. */
export async function mailStatement(hide: ListingHide, title: string) {
  const t = await getTranslations('ReportEmail');
  await mailOrg(hide.orgDid, async ({ name, dashboard }) => ({
    subject: t('statement.subject', { title }),
    text: t('statement.body', {
      name,
      title,
      statement: hide.statement,
      ground: t(`statement.ground.${hide.ground}`),
      dashboard,
    }),
  }));
}

/** The outcome of a second look, to the organisation. */
export async function mailSecondLook(
  orgDid: string,
  outcome: 'reinstated' | 'upheld',
  title: string,
  note?: string,
) {
  const t = await getTranslations('ReportEmail');
  await mailOrg(orgDid, async ({ name, dashboard }) => ({
    subject: t(`${outcome}.subject`, { title }),
    text: t(`${outcome}.body`, {
      name,
      title,
      note: note ?? '',
      hasNote: note ? 'yes' : 'no',
      dashboard,
    }),
  }));
}
