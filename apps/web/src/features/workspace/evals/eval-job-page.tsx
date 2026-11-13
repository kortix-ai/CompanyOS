'use client';

import { useTranslations } from '@/i18n/use-translations';
import type { WorkspaceEvalJob, WorkspaceEvalTrial } from '@kortix/sdk';
import { useWorkspaceEvalActions, useWorkspaceEvalJob } from '@kortix/sdk/react';
import { Badge } from '@kortix/ui/badge';
import { Button } from '@kortix/ui/button';
import { ConfirmDialog } from '@kortix/ui/confirm-dialog';
import { ErrorState } from '@kortix/ui/error-state';
import { Skeleton } from '@kortix/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@kortix/ui/table';
import { errorToast, successToast } from '@kortix/ui/toast';
import { ProjectPageHeader } from '@kortix/ui/workspace';
import { ArrowCounterClockwiseIcon, CheckIcon, MinusIcon, StopIcon, TrashIcon, WarningIcon, XIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { agentLabel, isOpenJob, latestRuns, percent, trialTone, type CellTone } from './eval-meta';
import { evalJobHref, evalsHref } from './evals-page';
import { EvalTrialSheet } from './eval-trial-sheet';

/** A status tint per cell, the solid color on its glyph (color.md → Accents and status). The glyph also reads without color. */
const CELL: Record<CellTone, { tint: string; glyph: React.ReactNode }> = {
  pass: { tint: 'bg-kortix-green/15', glyph: <CheckIcon weight="bold" className="text-kortix-green size-3.5" aria-hidden /> },
  fail: { tint: 'bg-kortix-red/15', glyph: <XIcon weight="bold" className="text-kortix-red size-3.5" aria-hidden /> },
  error: { tint: 'bg-kortix-orange/15', glyph: <WarningIcon weight="bold" className="text-kortix-orange size-3.5" aria-hidden /> },
  running: { tint: 'bg-kortix-blue/15', glyph: <span className="bg-kortix-blue size-1.5 rounded-full" aria-hidden /> },
  queued: { tint: 'bg-muted', glyph: null },
  cancelled: { tint: 'bg-muted', glyph: <MinusIcon className="text-muted-foreground size-3.5" aria-hidden /> },
};

/**
 * /workspaces/[id]/evals/jobs/[jobId] — one job: progress, the score of each
 * agent × model, and a matrix of every trial (tasks × agent and attempt).
 * A cell opens the trial: its rewards, error, timings, instruction and files.
 * Re-reads every 5 seconds until the job ends.
 */
export function EvalJobPage({ projectId, jobId }: { projectId: string; jobId: string }) {
  const t = useTranslations('evals');
  const router = useRouter();
  const query = useWorkspaceEvalJob(projectId, jobId);
  const actions = useWorkspaceEvalActions(projectId);
  const [trialId, setTrialId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const job = query.data?.job;
  const trials = query.data?.trials ?? [];

  const rerun = (scope: 'failed' | 'all') =>
    actions.rerun.mutate(
      { jobId, scope },
      {
        onSuccess: (next) => {
          successToast(t('rerunStarted', { job: next.job_name }));
          router.push(evalJobHref(projectId, next.job_id));
        },
        onError: (err) => errorToast(err instanceof Error ? err.message : String(err)),
      },
    );

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <ProjectPageHeader
        title={job?.job_name ?? t('title')}
        breadcrumb={
          <Link href={evalsHref(projectId)} className="text-muted-foreground hover:text-foreground">
            {t('title')}
          </Link>
        }
      >
        {job ? (
          <div className="flex items-center gap-2">
            {isOpenJob(job) ? (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={actions.cancel.isPending} onClick={() => actions.cancel.mutate(jobId, { onSuccess: () => successToast(t('cancelled')) })} data-testid="evals-cancel">
                <StopIcon className="size-3.5" aria-hidden />
                {t('cancel')}
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={actions.rerun.isPending} onClick={() => rerun('failed')} data-testid="evals-rerun-failed">
                  <ArrowCounterClockwiseIcon className="size-3.5" aria-hidden />
                  {t('rerunFailed')}
                </Button>
                <Button size="sm" variant="ghost" disabled={actions.rerun.isPending} onClick={() => rerun('all')}>
                  {t('rerunAll')}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={t('delete')} onClick={() => setDeleting(true)}>
                  <TrashIcon className="size-4" />
                </Button>
              </>
            )}
          </div>
        ) : null}
      </ProjectPageHeader>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        confirmLabel={t('delete')}
        confirmVariant="destructive"
        isPending={actions.remove.isPending}
        onConfirm={() =>
          actions.remove.mutate(jobId, {
            onSuccess: () => {
              successToast(t('deleted'));
              router.push(evalsHref(projectId));
            },
            onError: (err) => errorToast(err instanceof Error ? err.message : String(err)),
          })
        }
      />
      <EvalTrialSheet projectId={projectId} jobId={jobId} trialId={trialId} onClose={() => setTrialId(null)} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-8 px-4 py-6 pb-20 md:px-8">
          {query.isError ? (
            <ErrorState size="sm" title={t('loadError')} action={<Button size="sm" variant="outline" onClick={() => query.refetch()}>{t('retry')}</Button>} />
          ) : !job ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <>
              <Summary projectId={projectId} job={job} trials={trials} />
              <Scores job={job} />
              <Matrix trials={trials} onOpen={setTrialId} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({ projectId, job, trials }: { projectId: string; job: WorkspaceEvalJob; trials: WorkspaceEvalTrial[] }) {
  const t = useTranslations('evals');
  const s = job.stats;
  // Counted from the trials: the job's stats are recomputed once per runner tick and lag the trials by up to one.
  const runs = latestRuns(trials);
  const count = (...statuses: WorkspaceEvalTrial['status'][]) => runs.filter((trial) => statuses.includes(trial.status)).length;
  const variant = job.status === 'completed' ? (s.n_errored ? 'warning' : 'success') : job.status === 'cancelled' ? 'muted' : 'info';
  return (
    <div className="flex flex-col gap-1.5" data-testid="evals-job-summary">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={variant}>{t(`status.${job.status}`)}</Badge>
        <span className="text-muted-foreground tabular-nums">
          {t('progress', { done: count('completed', 'errored', 'cancelled'), total: runs.length || s.n_total_trials, running: count('starting', 'agent_running', 'verifying'), errored: count('errored') })}
        </span>
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {job.suite ? <span>{`${t('suite')}: ${job.suite}`}</span> : null}
        {job.commit ? <span className="font-mono">{t('commit', { sha: job.commit.slice(0, 7) })}</span> : null}
        {job.rerun_of ? (
          <Link href={evalJobHref(projectId, job.rerun_of)} className="hover:text-foreground underline">
            {t('rerunOf', { job: job.rerun_of.slice(0, 8) })}
          </Link>
        ) : null}
        <span>{t('folder', { folder: job.folder })}</span>
      </div>
    </div>
  );
}

function Scores({ job }: { job: WorkspaceEvalJob }) {
  const t = useTranslations('evals');
  if (!job.stats.agents.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={t('scores')}>
      <h2 className="text-muted-foreground text-xs font-medium">{t('scores')}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colAgent')}</TableHead>
            <TableHead className="text-right">{t('colScore')}</TableHead>
            <TableHead>{t('colPassK')}</TableHead>
            <TableHead>{t('colMetrics')}</TableHead>
            <TableHead className="text-right">{t('colValid')}</TableHead>
            <TableHead className="text-right">{t('colErrors')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {job.stats.agents.map((agent) => (
            <TableRow key={`${agent.agent}-${agent.model}`} data-testid="evals-score-row">
              <TableCell className="font-medium">{agentLabel(agent.agent, agent.model)}</TableCell>
              <TableCell className="text-right text-base font-medium tabular-nums">{percent(agent.pass_at_k['1'])}</TableCell>
              <TableCell className="text-muted-foreground text-xs tabular-nums">
                {Object.entries(agent.pass_at_k).map(([k, v]) => `@${k} ${percent(v)}`).join('  ')}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs tabular-nums">
                {agent.metrics.map((m) => Object.entries(m).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ')).join(' · ')}
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">{agent.n_trials}</TableCell>
              <TableCell className={`text-right tabular-nums ${agent.n_errors ? 'text-kortix-red' : 'text-muted-foreground'}`}>{agent.n_errors}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function Matrix({ trials, onOpen }: { trials: WorkspaceEvalTrial[]; onOpen: (trialId: string) => void }) {
  const t = useTranslations('evals');
  const runs = latestRuns(trials);
  const tasks = [...new Set(runs.map((trial) => trial.task_name))].sort();
  const columns = [...new Map(runs.map((trial) => [`${agentLabel(trial.agent, trial.model)}\u0000${trial.attempt}`, { agent: agentLabel(trial.agent, trial.model), attempt: trial.attempt }])).values()].sort(
    (a, b) => a.agent.localeCompare(b.agent) || a.attempt - b.attempt,
  );
  const cell = new Map(runs.map((trial) => [`${trial.task_name}\u0000${agentLabel(trial.agent, trial.model)}\u0000${trial.attempt}`, trial]));
  const agents = [...new Set(columns.map((c) => c.agent))];
  return (
    <section className="flex flex-col gap-2" aria-label={t('matrix')} data-testid="evals-matrix">
      <h2 className="text-muted-foreground text-xs font-medium" title={t('matrixInfo')}>
        {t('matrix')}
      </h2>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th />
              {agents.map((agent) => (
                <th key={agent} colSpan={columns.filter((c) => c.agent === agent).length} className="text-muted-foreground px-1 pb-1 text-left font-medium whitespace-nowrap">
                  {agent}
                </th>
              ))}
            </tr>
            <tr>
              <th className="text-muted-foreground pr-3 text-left font-medium">{t('colTasks')}</th>
              {columns.map((c) => (
                <th key={`${c.agent}-${c.attempt}`} className="text-muted-foreground px-1 font-normal tabular-nums">
                  {t('attempt', { n: c.attempt })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task}>
                <td className="text-foreground max-w-64 truncate py-0.5 pr-3 font-mono">{task}</td>
                {columns.map((c) => {
                  const trial = cell.get(`${task}\u0000${c.agent}\u0000${c.attempt}`);
                  if (!trial) return <td key={`${c.agent}-${c.attempt}`} />;
                  const tone = trialTone(trial);
                  return (
                    <td key={`${c.agent}-${c.attempt}`} className="px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => onOpen(trial.trial_id)}
                        aria-label={`${task} · ${c.agent} · ${t('attempt', { n: c.attempt })}: ${t(`trialStatus.${trial.status}`)}`}
                        className={`hover:ring-ring flex size-6 items-center justify-center rounded-sm hover:ring-1 ${CELL[tone].tint}`}
                        data-testid="evals-cell"
                        data-tone={tone}
                      >
                        {CELL[tone].glyph}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
