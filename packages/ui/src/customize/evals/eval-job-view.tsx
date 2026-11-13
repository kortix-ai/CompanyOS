'use client';

import type { WorkspaceEvalJob, WorkspaceEvalTiming, WorkspaceEvalTrial } from '@kortix/sdk';
import {
  useWorkspaceEvalActions,
  useWorkspaceEvalJob,
  useWorkspaceEvalTrial,
  useWorkspaceEvalTrialFile,
} from '@kortix/sdk/react';
import {
  ArrowCounterClockwiseIcon,
  CaretLeftIcon,
  CheckIcon,
  MinusIcon,
  StopIcon,
  TrashIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { useTranslations } from '../../i18n';
import { cn } from '../../internal/lib/utils';
import { UnifiedMarkdown } from '../../markdown';
import { Button } from '../../primitives/button';
import { ConfirmDialog } from '../../primitives/confirm-dialog';
import { EmptyState } from '../../primitives/empty-state';
import { ErrorState } from '../../primitives/error-state';
import { Hint } from '../../primitives/hint';
import { LocalTime } from '../../primitives/local-time';
import { Skeleton } from '../../primitives/skeleton';
import {
  SplitSheet,
  SplitSheetBody,
  SplitSheetContent,
  SplitSheetDescription,
  SplitSheetHeader,
  SplitSheetMain,
  SplitSheetTitle,
} from '../../primitives/split-sheet';
import { StatusBadge } from '../../primitives/status';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../primitives/table';
import { errorToast, successToast } from '../../primitives/toast';
import { UiLink as Link, useUiRouter } from '../../providers/ui-provider';
import {
  agentLabel,
  evalJobHref,
  evalsHref,
  evalTrialScore,
  isOpenJob,
  jobSource,
  latestRuns,
  percent,
  trialTone,
  type CellTone,
} from './eval-meta';
import { EVAL_FRAME, EVAL_TIME, InfoHint, jobTone } from './evals-page';

/** A status tint per cell, the solid color on its glyph (color.md → Accents and status). The glyph also reads without color. */
const CELL: Record<CellTone, { tint: string; glyph: ReactNode }> = {
  pass: {
    tint: 'bg-kortix-green/15',
    glyph: <CheckIcon weight="bold" className="text-kortix-green size-3.5" aria-hidden />,
  },
  fail: {
    tint: 'bg-kortix-red/15',
    glyph: <XIcon weight="bold" className="text-kortix-red size-3.5" aria-hidden />,
  },
  error: {
    tint: 'bg-kortix-orange/15',
    glyph: <WarningIcon weight="bold" className="text-kortix-orange size-3.5" aria-hidden />,
  },
  running: {
    tint: 'bg-kortix-blue/15',
    glyph: <span className="bg-kortix-blue size-1.5 rounded-full" aria-hidden />,
  },
  queued: { tint: 'bg-muted', glyph: null },
  cancelled: {
    tint: 'bg-muted',
    glyph: <MinusIcon className="text-muted-foreground size-3.5" aria-hidden />,
  },
};
const LEGEND: CellTone[] = ['pass', 'fail', 'error', 'running', 'queued'];

const seconds = (timing: WorkspaceEvalTiming): string =>
  timing.started_at && timing.finished_at
    ? `${Math.round((Date.parse(timing.finished_at) - Date.parse(timing.started_at)) / 100) / 10} s`
    : '—';

/**
 * Customize → Evals → one job (`/admin/evals/jobs/<id>`): progress, the score
 * of each agent × model, and the trials as a matrix (tasks × agent and
 * attempt). A cell opens the trial beside the matrix. Re-reads every 5
 * seconds until the job ends.
 */
export function EvalJobView({ projectId, jobId }: { projectId: string; jobId: string }) {
  const t = useTranslations('evals');
  const router = useUiRouter();
  const query = useWorkspaceEvalJob(projectId, jobId);
  const actions = useWorkspaceEvalActions(projectId);
  const [trialId, setTrialId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const job = query.data?.job;
  const trials = query.data?.trials ?? [];
  const notFound = query.isError && (query.error as { status?: number } | null)?.status === 404;

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
  const hasFailed = trials.some(
    (trial) => !evalTrialScore(trial).passed && trial.status !== 'cancelled',
  );

  return (
    <SplitSheet
      open={!!trialId}
      onOpenChange={(next) => !next && setTrialId(null)}
      size="lg"
      className="min-h-0 flex-1 [--split-sheet-max:55%] [--split-sheet-width:45%]"
    >
      <SplitSheetMain className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 pb-20 md:px-8">
            <Button asChild variant="text" size="sm" className="-ml-1 w-fit px-0 has-[>svg]:px-0">
              <Link href={evalsHref(projectId)}>
                <CaretLeftIcon className="size-3.5 shrink-0" />
                {t('title')}
              </Link>
            </Button>
            {notFound ? (
              <EmptyState
                size="sm"
                title={t('jobNotFound')}
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href={evalsHref(projectId)}>{t('title')}</Link>
                  </Button>
                }
              />
            ) : query.isError ? (
              <ErrorState
                size="sm"
                title={t('loadError')}
                action={
                  <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                    {t('retry')}
                  </Button>
                }
              />
            ) : !job ? (
              <div className="flex flex-col gap-3" aria-busy>
                <Skeleton className="h-7 w-72" />
                <Skeleton className="h-4 w-96" />
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-lg" />
              </div>
            ) : (
              <>
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h1 className="text-foreground min-w-0 text-xl font-medium wrap-break-word">
                        {job.job_name}
                      </h1>
                      <StatusBadge tone={jobTone(job)}>{t(`status.${job.status}`)}</StatusBadge>
                    </div>
                    <Summary projectId={projectId} job={job} trials={trials} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isOpenJob(job) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={actions.cancel.isPending}
                        aria-busy={actions.cancel.isPending}
                        onClick={() =>
                          actions.cancel.mutate(jobId, {
                            onSuccess: () => successToast(t('cancelled')),
                          })
                        }
                        data-testid="evals-cancel"
                      >
                        <StopIcon className="size-3.5" aria-hidden />
                        {t('cancel')}
                      </Button>
                    ) : (
                      <>
                        {hasFailed ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={actions.rerun.isPending}
                            onClick={() => rerun('failed')}
                            data-testid="evals-rerun-failed"
                          >
                            <ArrowCounterClockwiseIcon className="size-3.5" aria-hidden />
                            {t('rerunFailed')}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant={hasFailed ? 'ghost' : 'outline'}
                          disabled={actions.rerun.isPending}
                          onClick={() => rerun('all')}
                          data-testid="evals-rerun-all"
                        >
                          {t('rerunAll')}
                        </Button>
                        <Hint label={t('delete')}>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('delete')}
                            onClick={() => setDeleting(true)}
                          >
                            <TrashIcon className="size-4" />
                          </Button>
                        </Hint>
                      </>
                    )}
                  </div>
                </header>
                <Scores job={job} trials={trials} compact={!!trialId} />
                <Matrix trials={trials} selected={trialId} onOpen={setTrialId} />
              </>
            )}
          </div>
        </div>
      </SplitSheetMain>
      {trialId ? <TrialPanel projectId={projectId} jobId={jobId} trialId={trialId} /> : null}
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
    </SplitSheet>
  );
}

function Summary({
  projectId,
  job,
  trials,
}: {
  projectId: string;
  job: WorkspaceEvalJob;
  trials: WorkspaceEvalTrial[];
}) {
  const t = useTranslations('evals');
  // Counted from the trials: the job's stats are recomputed once per runner tick and lag the trials by up to one.
  const runs = latestRuns(trials);
  const count = (...statuses: WorkspaceEvalTrial['status'][]) =>
    runs.filter((trial) => statuses.includes(trial.status)).length;
  return (
    <div
      className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      data-testid="evals-job-summary"
    >
      <span className="text-foreground tabular-nums">
        {t('progress', {
          done: count('completed', 'errored', 'cancelled'),
          total: runs.length || job.stats.n_total_trials,
          running: count('starting', 'agent_running', 'verifying'),
          errored: count('errored'),
        })}
      </span>
      <span>{jobSource(job)}</span>
      {job.commit ? <span className="font-mono">{job.commit.slice(0, 7)}</span> : null}
      <LocalTime value={job.created_at} options={EVAL_TIME} />
      {job.rerun_of ? (
        <Link
          href={evalJobHref(projectId, job.rerun_of)}
          className="hover:text-foreground underline underline-offset-2"
        >
          {t('rerunOf', { job: job.rerun_of.slice(0, 8) })}
        </Link>
      ) : null}
    </div>
  );
}

function Scores({
  job,
  trials,
  compact,
}: {
  job: WorkspaceEvalJob;
  trials: WorkspaceEvalTrial[];
  /** A trial is open beside the page: leave out Pass@k and Valid so the table fits the narrower column. */
  compact: boolean;
}) {
  const t = useTranslations('evals');
  if (!job.stats.agents.length) return null;
  // The mean of each valid trial's own score (the mean of its rewards): one number per agent that reads
  // the same whatever reward keys each task writes. Harbor's per-key metrics stay one hover away.
  const runs = latestRuns(trials);
  const meanScore = (agent: string, model: string | null) => {
    const scores = runs
      .filter((trial) => trial.agent === agent && (trial.model ?? null) === (model ?? null))
      .map((trial) => evalTrialScore(trial).score)
      .filter((score): score is number => score !== null);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  };
  return (
    <section className="flex flex-col gap-3" aria-label={t('scores')}>
      <h2 className="text-foreground flex items-center gap-1.5 text-sm font-medium">
        {t('scores')}
        <InfoHint text={t('scoresInfo')} />
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colAgent')}</TableHead>
            <TableHead className="text-right">{t('colScore')}</TableHead>
            {compact ? null : (
              <TableHead className="hidden sm:table-cell">{t('colPassK')}</TableHead>
            )}
            <TableHead className="hidden text-right sm:table-cell">{t('colMeanScore')}</TableHead>
            {compact ? null : <TableHead className="text-right">{t('colValid')}</TableHead>}
            <TableHead className="text-right">{t('colErrors')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {job.stats.agents.map((agent) => (
            <TableRow key={`${agent.agent}-${agent.model}`} data-testid="evals-score-row">
              <TableCell className="max-w-64 truncate font-medium">
                {agentLabel(agent.agent, agent.model)}
              </TableCell>
              <TableCell className="text-right text-base font-medium tabular-nums">
                {percent(agent.pass_at_k['1'])}
              </TableCell>
              {compact ? null : (
                <TableCell className="text-muted-foreground hidden text-xs tabular-nums sm:table-cell">
                  {Object.entries(agent.pass_at_k)
                    .map(([k, v]) => `@${k} ${percent(v)}`)
                    .join('  ')}
                </TableCell>
              )}
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                <span className="inline-flex items-center justify-end gap-1.5">
                  {percent(meanScore(agent.agent, agent.model))}
                  <InfoHint
                    text={t('metricsHint', {
                      metrics: agent.metrics
                        .map((m) =>
                          Object.entries(m)
                            .map(([k, v]) => `${k} ${v.toFixed(2)}`)
                            .join(', '),
                        )
                        .join(' · '),
                    })}
                  />
                </span>
              </TableCell>
              {compact ? null : (
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {agent.n_trials}
                </TableCell>
              )}
              <TableCell className="text-right tabular-nums">
                {agent.n_errors ? (
                  <span className="text-foreground inline-flex items-center gap-1">
                    <WarningIcon weight="bold" className="text-kortix-orange size-3" aria-hidden />
                    {agent.n_errors}
                  </span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function Matrix({
  trials,
  selected,
  onOpen,
}: {
  trials: WorkspaceEvalTrial[];
  selected: string | null;
  onOpen: (trialId: string) => void;
}) {
  const t = useTranslations('evals');
  const runs = latestRuns(trials);
  const tasks = [...new Set(runs.map((trial) => trial.task_name))].sort();
  const columns = [
    ...new Map(
      runs.map((trial) => [
        `${agentLabel(trial.agent, trial.model)}\u0000${trial.attempt}`,
        { agent: agentLabel(trial.agent, trial.model), attempt: trial.attempt },
      ]),
    ).values(),
  ].sort((a, b) => a.agent.localeCompare(b.agent) || a.attempt - b.attempt);
  const cell = new Map(
    runs.map((trial) => [
      `${trial.task_name}\u0000${agentLabel(trial.agent, trial.model)}\u0000${trial.attempt}`,
      trial,
    ]),
  );
  const agents = [...new Set(columns.map((c) => c.agent))];
  // With one attempt per agent the attempt row says nothing.
  const multiAttempt = columns.length > agents.length;
  return (
    <section className="flex flex-col gap-3" aria-label={t('matrix')} data-testid="evals-matrix">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-foreground flex items-center gap-1.5 text-sm font-medium">
          {t('matrix')}
          <InfoHint text={t('matrixInfo')} />
        </h2>
        <ul
          className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
          aria-label={t('legend')}
        >
          {LEGEND.map((tone) => (
            <li key={tone} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded-sm [&_svg]:size-2.5',
                  CELL[tone].tint,
                )}
              >
                {CELL[tone].glyph}
              </span>
              {t(`tone.${tone}`)}
            </li>
          ))}
        </ul>
      </div>
      <div className={`${EVAL_FRAME} overflow-x-auto p-4`}>
        <table className="text-xs">
          <thead>
            <tr>
              <th className="text-muted-foreground pr-4 pb-1 text-left font-medium">
                {multiAttempt ? null : t('colTasks')}
              </th>
              {agents.map((agent) => (
                <th
                  key={agent}
                  colSpan={columns.filter((c) => c.agent === agent).length}
                  className="text-muted-foreground max-w-48 truncate px-1 pb-1 text-left font-medium whitespace-nowrap"
                  title={agent}
                >
                  {agent}
                </th>
              ))}
            </tr>
            {multiAttempt ? (
              <tr>
                <th className="text-muted-foreground pr-4 pb-1 text-left font-medium">
                  {t('colTasks')}
                </th>
                {columns.map((c) => (
                  <th
                    key={`${c.agent}-${c.attempt}`}
                    className="text-muted-foreground px-1 pb-1 text-left font-normal tabular-nums"
                  >
                    {t('attempt', { n: c.attempt })}
                  </th>
                ))}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task}>
                <td className="text-foreground max-w-64 truncate py-0.5 pr-4 font-mono">{task}</td>
                {columns.map((c) => {
                  const trial = cell.get(`${task}\u0000${c.agent}\u0000${c.attempt}`);
                  if (!trial) return <td key={`${c.agent}-${c.attempt}`} />;
                  const tone = trialTone(trial);
                  return (
                    <td key={`${c.agent}-${c.attempt}`} className="px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => onOpen(trial.trial_id)}
                        aria-pressed={selected === trial.trial_id}
                        aria-label={`${task} · ${c.agent} · ${t('attempt', { n: c.attempt })}: ${t(`tone.${tone}`)}`}
                        className={cn(
                          'hover:ring-ring focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm outline-none hover:ring-1 focus-visible:ring-2',
                          CELL[tone].tint,
                          selected === trial.trial_id && 'ring-foreground ring-2',
                        )}
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

/** One trial, beside the matrix: result, error and policy, timings, the instruction, and its files. */
function TrialPanel({
  projectId,
  jobId,
  trialId,
}: {
  projectId: string;
  jobId: string;
  trialId: string;
}) {
  const t = useTranslations('evals');
  const detail = useWorkspaceEvalTrial(projectId, jobId, trialId);
  const [picked, setPicked] = useState<string | null>(null);
  const files = detail.data?.files ?? [];
  // The verifier's own output first: it says why the score is what it is.
  const path =
    picked && files.some((f) => f.path === picked)
      ? picked
      : ((files.find((f) => f.path === 'verifier/test-stdout.txt') ?? files[0])?.path ?? null);
  const file = useWorkspaceEvalTrialFile(projectId, jobId, trialId, path);
  const trial = detail.data?.trial;
  const score = trial ? evalTrialScore(trial) : null;
  const tone = trial ? trialTone(trial) : null;

  return (
    <SplitSheetContent data-testid="evals-trial-sheet">
      <PanelFocus key={trialId}>
        <SplitSheetHeader closeLabel={t('close')}>
          <SplitSheetTitle className="font-mono">{trial?.trial_name ?? t('trial')}</SplitSheetTitle>
          <SplitSheetDescription>
            {trial ? `${trial.task_path} · ${agentLabel(trial.agent, trial.model)}` : ' '}
          </SplitSheetDescription>
        </SplitSheetHeader>
        <SplitSheetBody className="flex flex-col gap-6">
          {!trial ? (
            <div className="flex flex-col gap-2" aria-busy>
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <section className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={
                      tone === 'pass'
                        ? 'success'
                        : tone === 'error'
                          ? 'warning'
                          : tone === 'fail'
                            ? 'destructive'
                            : tone === 'running'
                              ? 'info'
                              : 'neutral'
                    }
                    data-testid="evals-trial-result"
                  >
                    {t(`tone.${tone}`)}
                  </StatusBadge>
                  {trial.rewards
                    ? Object.entries(trial.rewards).map(([name, value]) => (
                        <span
                          key={name}
                          className="text-muted-foreground font-mono text-xs tabular-nums"
                        >{`${name} ${value}`}</span>
                      ))
                    : null}
                </div>
                {score && trial.rewards && !trial.reward_valid ? (
                  <p className="text-muted-foreground text-xs">{t('rewardInvalid')}</p>
                ) : null}
                {trial.exception ? (
                  <div
                    className="bg-kortix-orange/15 flex flex-col gap-1 rounded-md p-3 text-xs"
                    data-testid="evals-trial-error"
                  >
                    <span className="text-foreground font-medium wrap-break-word">{`${trial.exception.exception_type}: ${trial.exception.exception_message}`}</span>
                    <span className="text-muted-foreground">
                      {t('policy', {
                        retry: trial.exception.policy.should_retry ? t('yes') : t('no'),
                        grade: trial.exception.policy.should_grade ? t('yes') : t('no'),
                        valid: trial.exception.policy.has_valid_reward ? t('yes') : t('no'),
                      })}
                    </span>
                  </div>
                ) : null}
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-xs font-medium">{t('timings')}</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xs tabular-nums">
                  <dt className="text-muted-foreground">{t('sandbox')}</dt>
                  <dd className="text-foreground">{seconds(trial.environment_setup)}</dd>
                  <dt className="text-muted-foreground">{t('agentTime')}</dt>
                  <dd className="text-foreground">{seconds(trial.agent_execution)}</dd>
                  <dt className="text-muted-foreground">{t('verifierTime')}</dt>
                  <dd className="text-foreground">{seconds(trial.verifier)}</dd>
                  {trial.usage ? (
                    <>
                      <dt className="text-muted-foreground">{t('tokensLabel')}</dt>
                      <dd className="text-foreground">
                        {t('tokens', {
                          input: trial.usage.n_input_tokens.toLocaleString(),
                          output: trial.usage.n_output_tokens.toLocaleString(),
                        })}
                      </dd>
                    </>
                  ) : null}
                </dl>
                {trial.session_id ? (
                  <Button asChild size="sm" variant="outline" className="mt-1 self-start">
                    <Link href={`/workspaces/${projectId}/sessions/${trial.session_id}`}>
                      {t('openSession')}
                    </Link>
                  </Button>
                ) : null}
              </section>
              {detail.data?.instruction ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-muted-foreground text-xs font-medium">{t('instruction')}</h3>
                  <div className="text-foreground text-sm" data-testid="evals-trial-instruction">
                    {/* A task's instruction is someone else's text: untrusted, no HTML, no remote images. */}
                    <UnifiedMarkdown
                      content={detail.data.instruction}
                      trust="untrusted"
                      variant="document"
                    />
                  </div>
                </section>
              ) : null}
              <section className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-xs font-medium">{t('files')}</h3>
                {files.length === 0 ? (
                  <p className="text-muted-foreground text-xs">{t('noFiles')}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('files')}>
                      {files.map((f) => (
                        <Button
                          key={f.path}
                          role="tab"
                          aria-selected={f.path === path}
                          size="xs"
                          variant={f.path === path ? 'secondary' : 'ghost'}
                          className="font-mono"
                          onClick={() => setPicked(f.path)}
                        >
                          {f.path}
                        </Button>
                      ))}
                    </div>
                    <pre
                      className="bg-muted text-foreground max-h-[28rem] overflow-auto rounded-md p-3 font-mono text-xs wrap-break-word whitespace-pre-wrap"
                      data-testid="evals-trial-file"
                    >
                      {file.isLoading ? '…' : (file.data ?? '')}
                    </pre>
                  </>
                )}
              </section>
            </>
          )}
        </SplitSheetBody>
      </PanelFocus>
    </SplitSheetContent>
  );
}

/**
 * A cell opens the panel, not a `SplitSheetTrigger`, so focus moves in here on
 * open (Escape inside the sheet closes it) and goes back to the cell on close,
 * as the Triggers panel does.
 */
function PanelFocus({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel?.focus({ preventScroll: true });
    return () => {
      // Layout cleanup runs before the panel detaches, so focus is still readable.
      if (panel?.contains(document.activeElement) && opener?.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div ref={ref} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
      {children}
    </div>
  );
}
