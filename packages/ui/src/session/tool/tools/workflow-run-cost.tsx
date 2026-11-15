'use client';

import { useEffect } from 'react';
import { formatUsdAsCredits } from '@kortix/shared';
import type { SessionUsage, SessionUsageTotals } from '@kortix/sdk';
import { useSessionUsage } from '@kortix/sdk/react';
import Hint from '../../../primitives/hint';
import { useTranslations } from '../../../i18n';

/** While the run works, its spend is read again this often. */
const LIVE_REFRESH_MS = 30_000;

/** What Kortix debited for one usage entry: model calls plus compute; a server before compute was added gives model calls only. */
function billed(totals: SessionUsageTotals): number {
  return totals.billed_cost ?? totals.kortix_cost;
}

/**
 * What a workflow run cost so far, in USD, from the session usage tree
 * (`GET …/sessions/:id/usage`): model calls and box time that Kortix billed.
 *
 * - A background run: its runner session and every agent session under it
 *   (`total`), which is the whole run.
 * - A run in the calling session: only its agents' sessions and their
 *   descendants. The caller's own turns are not part of the run.
 *
 * Own-key (BYOK) model spend is not in it: Kortix did not bill it. Exported for tests.
 */
export function runSpentUsd(
  usage: Pick<SessionUsage, 'total' | 'sessions'>,
  agentSessionIds?: readonly string[],
): number {
  if (!agentSessionIds) return billed(usage.total);
  const inRun = new Set(agentSessionIds);
  let sum = 0;
  // `sessions` is depth-first, so a parent is decided before its children.
  for (const entry of usage.sessions) {
    if (!inRun.has(entry.session_id) && !(entry.parent_session_id && inRun.has(entry.parent_session_id))) continue;
    inRun.add(entry.session_id);
    sum += billed(entry);
  }
  return sum;
}

/**
 * "Spent N credits" for a workflow run card: the actual spend, never an
 * estimate. Renders nothing until the read answers, and nothing for a run that
 * has cost nothing yet. Refreshed every 30 s while the run works.
 */
export function WorkflowRunCost({
  projectId,
  rootSessionId,
  agentSessionIds,
  live,
}: {
  projectId: string | undefined;
  /** The runner of a background run, else the session that called `workflow`. */
  rootSessionId: string | undefined;
  /** A run in the calling session: its agents' session ids. Omit for a background run. */
  agentSessionIds?: readonly string[];
  live: boolean;
}) {
  const t = useTranslations('tools.workflow');
  const usage = useSessionUsage(projectId, rootSessionId);
  const { refetch } = usage;
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void refetch(), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, refetch]);
  if (!usage.data) return null;
  const usd = runSpentUsd(usage.data, agentSessionIds);
  if (!(usd > 0)) return null;
  return (
    <Hint label={t('spentHint')} side="top">
      <span data-testid="workflow-run-cost" className="text-muted-foreground shrink-0 px-2 text-xs tabular-nums">
        {t('spent', { credits: formatUsdAsCredits(usd) })}
      </span>
    </Hint>
  );
}
