/**
 * The 30-day notice before a new subprocessor processes customer personal data
 * (DPA section 7.3). The list and its rules live in
 * `@kortix/shared/subprocessors`: a row with `addedOn` is announced from the
 * first sweep that sees it on prod until it takes effect.
 *
 * Each open notice goes once to every person who is a billing manager (owner
 * or admin) of a paid account, listing the paid workspaces they manage (or
 * "all workspaces" when that is every paid account). Claim rows in
 * `chat_event_dedup` (per account, per person, per report) make each email
 * once-only across replicas, sweeps and retries. Prod only, so a dev or
 * staging deploy of the list emails nobody.
 *
 * Evidence: each covered account gets a `legal.subprocessor_notice.sent`
 * audit event (it shows in that account's audit log), and privacy@kortix.com
 * gets one report per notice from the sweep that first delivers it, flagged
 * when it gave fewer than 30 days.
 */
import { createHash } from 'node:crypto';
import { chatEventDedup, creditAccounts } from '@kortix/db';
import {
  formatSubprocessorDate,
  SUBPROCESSOR_NOTICE_DAYS,
  subprocessorEffectiveDate,
  SUBPROCESSORS_CORE,
  SUBPROCESSORS_OPTIONAL,
  type Subprocessor,
} from '@kortix/shared/subprocessors';
import { isNotNull, notInArray, and, eq } from 'drizzle-orm';
import { config } from '../../config';
import { renderEmail, renderText, S, actionButton } from '../../lib/email/template';
import { logger } from '../../lib/logger';
import { db } from '../../shared/db';
import { recordAuditEvent } from '../../shared/audit';
import { escapeHtml } from '../../shared/html';
import { claimOnce } from './access-notices';
import { billingManagers, sendAlertEmail } from './owner-alerts';

const PRIVACY_EMAIL = 'privacy@kortix.com';

export type SubprocessorNotice = { addedOn: string; effectiveDate: string; rows: Subprocessor[] };

/** The notices open on `today` (`YYYY-MM-DD`): added, not yet in effect. One per `addedOn` day. */
export function openSubprocessorNotices(rows: readonly Subprocessor[], today: string): SubprocessorNotice[] {
  const byDate = new Map<string, SubprocessorNotice>();
  for (const row of rows) {
    const effectiveDate = subprocessorEffectiveDate(row);
    if (!row.addedOn || !effectiveDate || row.addedOn > today || effectiveDate <= today) continue;
    const notice = byDate.get(row.addedOn) ?? { addedOn: row.addedOn, effectiveDate, rows: [] };
    notice.rows.push(row);
    byDate.set(row.addedOn, notice);
  }
  return [...byDate.values()];
}

/** The "owner or admin of ___" phrase: the workspace names, or "all workspaces" when the person manages every paid account. */
export function workspaceScope(names: string[], paidTotal: number): string {
  const unique = [...new Set(names)];
  if (unique.length > 1 && unique.length === paidTotal) return 'all workspaces';
  return new Intl.ListFormat('en', { type: 'conjunction' }).format(unique);
}

function compose(notice: SubprocessorNotice, scope: string) {
  const url = `${(config.FRONTEND_URL || 'https://kortix.com').replace(/\/+$/, '')}/legal/subprocessors`;
  const effective = formatSubprocessorDate(notice.effectiveDate);
  const title = 'New Kortix subprocessors';
  const intro = `Kortix will add the subprocessors below on ${effective}. Until then they process no customer personal data. You receive this notice as an owner or admin of ${scope}, as our Data Processing Addendum (section 7.3) requires.`;
  const outro = `To object, reply to this email or write to ${PRIVACY_EMAIL} before ${effective}.`;
  const items = notice.rows.map((row) => `${row.name}: ${row.purpose} (${row.location})`);
  return {
    subject: `Kortix subprocessor update, effective ${effective}`,
    category: 'legal-subprocessor-notice',
    replyTo: PRIVACY_EMAIL,
    html: renderEmail({
      title,
      body: `<p style="${S.p}">${escapeHtml(intro)}</p>${items.map((item) => `<p style="${S.p}">${escapeHtml(item)}</p>`).join('')}<p style="${S.p}">${escapeHtml(outro)}</p>${actionButton(url, 'View all subprocessors')}`,
    }),
    text: renderText({ title, paragraphs: [intro, ...items, outro], cta: { url, label: 'View all subprocessors' } }),
  };
}

/**
 * The claim keys of one notice in `chat_event_dedup`. The account key is held
 * once the account is covered (its audit event exists); the person key once
 * that inbox has the email; the report key once privacy@ has the record.
 */
const claimKey = {
  account: (notice: SubprocessorNotice, accountId: string) => `legal:subprocessor-notice:${notice.addedOn}:${accountId}`,
  // A hash, so the dedup table holds no address.
  person: (notice: SubprocessorNotice, to: string) =>
    `legal:subprocessor-notice:${notice.addedOn}:to:${createHash('sha256').update(to.toLowerCase()).digest('hex')}`,
  report: (notice: SubprocessorNotice) => `legal:subprocessor-notice:${notice.addedOn}:report`,
};

const release = (key: string) => db.delete(chatEventDedup).where(eq(chatEventDedup.eventId, key));

/**
 * The hourly sweep: email each open notice once per person, listing the paid
 * workspaces it covers. A later sweep emails only people who do not have the
 * notice yet, and retries a failed delivery for its recipient only.
 */
export async function runSubprocessorNoticeSweep(
  now: Date = new Date(),
  rows: readonly Subprocessor[] = [...SUBPROCESSORS_CORE, ...SUBPROCESSORS_OPTIONAL],
): Promise<{ accountsNotified: number }> {
  if (config.INTERNAL_KORTIX_ENV !== 'prod') return { accountsNotified: 0 };
  const notices = openSubprocessorNotices(rows, now.toISOString().slice(0, 10));
  if (notices.length === 0) return { accountsNotified: 0 };

  const paid = await db
    .select({ accountId: creditAccounts.accountId })
    .from(creditAccounts)
    .where(and(isNotNull(creditAccounts.tier), notInArray(creditAccounts.tier, ['free', 'none'])));
  let accountsNotified = 0;
  for (const notice of notices) {
    // Claim each account not yet covered, then group the claimed workspaces
    // by recipient inbox: one email per person, not one per project (KRTX-4819).
    const claimed: { accountId: string; accountName: string; emails: string[] }[] = [];
    for (const { accountId } of paid) {
      const claim = claimKey.account(notice, accountId);
      if (!(await claimOnce(claim))) continue;
      try {
        const { emails, accountName } = await billingManagers(accountId);
        // Nobody to email yet: release the claim so a later sweep retries the account.
        if (emails.length === 0) await release(claim);
        else claimed.push({ accountId, accountName, emails });
      } catch (err) {
        logger.warn('[subprocessor-notices] notice failed', { accountId, error: (err as Error).message });
        await release(claim);
      }
    }
    const inboxes = new Map<string, string[]>();
    for (const { accountName, emails } of claimed) {
      for (const to of emails) inboxes.set(to, [...(inboxes.get(to) ?? []), accountName]);
    }
    // A person claim taken by an earlier or concurrent sweep means that inbox has the notice.
    const sentNow = new Set<string>();
    const sentBefore = new Set<string>();
    for (const [to, workspaces] of inboxes) {
      const claim = claimKey.person(notice, to);
      if (!(await claimOnce(claim))) {
        sentBefore.add(to);
        continue;
      }
      const result = await sendAlertEmail({ ...compose(notice, workspaceScope(workspaces, paid.length)), to: [to] });
      if (result.ok) sentNow.add(to);
      else {
        logger.warn('[subprocessor-notices] notice failed', { error: 'error' in result ? result.error : result.reason });
        await release(claim);
      }
    }
    // Evidence: one audit event per account once every manager has the
    // notice. An account with a failed delivery is released: the next sweep
    // retries the missed inbox and the person claims keep the others from a second email.
    let covered = 0;
    for (const { accountId, emails } of claimed) {
      if (!emails.every((to) => sentNow.has(to) || sentBefore.has(to))) {
        await release(claimKey.account(notice, accountId));
        continue;
      }
      covered++;
      try {
        await recordAuditEvent({
          accountId,
          actorType: 'system',
          action: 'legal.subprocessor_notice.sent',
          resourceType: 'subprocessor_notice',
          resourceId: notice.addedOn,
          outputSummary: {
            recipients: emails.length,
            previously_notified: emails.filter((to) => sentBefore.has(to)).length,
            effective_date: notice.effectiveDate,
            subprocessors: notice.rows.map((row) => row.name),
          },
        });
      } catch (err) {
        logger.warn('[subprocessor-notices] audit failed', { accountId, error: (err as Error).message });
      }
    }
    // One record per notice: the sweep that first delivers it. Later sweeps
    // only add accounts, and their audit events are the evidence.
    if (sentNow.size > 0 && (await claimOnce(claimKey.report(notice)))) {
      if (!(await reportToPrivacy(notice, covered, now))) await release(claimKey.report(notice));
    }
    accountsNotified += covered;
  }
  return { accountsNotified };
}

/** The compliance record: what went out, to how many accounts, and how much notice it gave. True when it was delivered. */
async function reportToPrivacy(notice: SubprocessorNotice, accounts: number, now: Date): Promise<boolean> {
  const days = Math.floor((Date.parse(`${notice.effectiveDate}T00:00:00Z`) - now.getTime()) / 86_400_000);
  const late = days < SUBPROCESSOR_NOTICE_DAYS;
  const title = late
    ? `Subprocessor notice gave only ${days} days`
    : `Subprocessor notice sent to ${accounts} accounts`;
  const paragraphs = [
    `The notice for the subprocessors added ${notice.addedOn} went to the owners and admins of ${accounts} paid accounts in this sweep. It takes effect ${formatSubprocessorDate(notice.effectiveDate)}, ${days} days from now.`,
    ...notice.rows.map((row) => `${row.name}: ${row.purpose} (${row.location})`),
    ...(late
      ? [`The DPA promises ${SUBPROCESSOR_NOTICE_DAYS} days. Send no customer data to these subprocessors until ${SUBPROCESSOR_NOTICE_DAYS} days from now, and move their addedOn in packages/shared/src/subprocessors.ts so the page shows that date.`]
      : []),
    'Each notified account has a legal.subprocessor_notice.sent audit event. An account that turns paid later gets the notice from a later sweep and its own audit event; this report is not sent again.',
  ];
  logger.info('[subprocessor-notices] notices sent', { addedOn: notice.addedOn, accounts, days });
  const result = await sendAlertEmail({
    to: [PRIVACY_EMAIL],
    subject: `[Kortix compliance] ${title}`,
    category: 'legal-subprocessor-notice-report',
    html: renderEmail({
      title,
      body: paragraphs.map((p) => `<p style="${S.p}">${escapeHtml(p)}</p>`).join(''),
    }),
    text: renderText({ title, paragraphs }),
  });
  if (!result.ok) logger.warn('[subprocessor-notices] privacy report failed', { error: 'error' in result ? result.error : result.reason });
  return result.ok;
}
