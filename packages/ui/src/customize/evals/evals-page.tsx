'use client';

import type { WorkspaceEvalJob, WorkspaceEvalSuite } from '@kortix/sdk';
import { useWorkspaceEvalJobs, useWorkspaceEvalSuites } from '@kortix/sdk/react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartBarIcon,
  InfoIcon,
  PlayIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';

import { useTranslations } from '../../i18n';
import { Button } from '../../primitives/button';
import { EmptyArt } from '../../primitives/empty-art';
import { EmptyState } from '../../primitives/empty-state';
import { ErrorState } from '../../primitives/error-state';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../primitives/hover-card';
import { LocalTime } from '../../primitives/local-time';
import { Skeleton } from '../../primitives/skeleton';
import { StatusBadge, type StatusTone } from '../../primitives/status';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../primitives/table';
import { UiLink as Link, useUiRouter } from '../../providers/ui-provider';
import { CapabilityPageShell } from '../shared/capability-page-shell';
import {
  agentLabel,
  evalJobHref,
  evalJobScore,
  isOpenJob,
  jobSource,
  leaderboard,
  percent,
} from './eval-meta';
import { RunEvalModal, type RunTarget } from './run-eval-modal';

/** The frame of a list or a matrix: the same one the `Table` primitive draws, so every block of the page matches. */
export const EVAL_FRAME = 'border-border bg-popover overflow-hidden rounded-md border';

/** A job's time: day and minute, in the viewer's zone. */
export const EVAL_TIME: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

/** The tone of a job's status: green when every trial ended clean, orange with errors. */
export function jobTone(job: Pick<WorkspaceEvalJob, 'status' | 'stats'>): StatusTone {
  if (job.status === 'completed') return job.stats.n_errored ? 'warning' : 'success';
  if (job.status === 'cancelled') return 'neutral';
  return 'info';
}

/** The `i` beside a section title: one explanation, on hover and on focus. */
export function InfoHint({ text }: { text: string }) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className="text-muted-foreground hover:text-foreground focus-visible:text-foreground inline-flex"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="text-muted-foreground w-72 text-xs">{text}</HoverCardContent>
    </HoverCard>
  );
}

function SectionTitle({ title, info }: { title: string; info?: string }) {
  return (
    <h2 className="text-foreground flex items-center gap-1.5 text-sm font-medium">
      {title}
      {info ? <InfoHint text={info} /> : null}
    </h2>
  );
}

/**
 * Customize → Evals: the leaderboard (each source × agent × model, its latest
 * score and the change since the job before), the suites of kortix.yaml with
 * Run, and every job. The job list re-reads every 5 seconds while a job runs.
 * A job opens in this section (`/admin/evals/jobs/<id>`).
 */
export function EvalsPage({ projectId }: { projectId: string }) {
  const t = useTranslations('evals');
  const suites = useWorkspaceEvalSuites(projectId);
  const jobs = useWorkspaceEvalJobs(projectId);
  // `false`: closed. A target: the modal opens on it. `null`: the first one.
  const [running, setRunning] = useState<RunTarget | null | false>(false);
  const list = jobs.data ?? [];
  const board = leaderboard(list);
  const suiteList = suites.data ?? [];
  const loading = suites.isLoading || jobs.isLoading;

  const run = (
    <Button size="sm" className="gap-1.5" onClick={() => setRunning(null)} data-testid="evals-run">
      <PlayIcon weight="fill" className="size-3.5 shrink-0" aria-hidden />
      {t('run')}
    </Button>
  );

  return (
    <CapabilityPageShell
      title={t('title')}
      description={t('description')}
      titleAddon={<InfoHint text={t('titleInfo')} />}
      action={loading ? undefined : run}
    >
      <RunEvalModal
        projectId={projectId}
        suites={suiteList}
        target={running || null}
        open={running !== false}
        onOpenChange={(open) => !open && setRunning(false)}
      />
      {suites.isError || jobs.isError ? (
        <ErrorState
          size="sm"
          title={t('loadError')}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => void Promise.all([suites.refetch(), jobs.refetch()])}
            >
              {t('retry')}
            </Button>
          }
        />
      ) : loading ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : suiteList.length === 0 && list.length === 0 ? (
        <EmptyState
          media={<EmptyArt icon={ChartBarIcon} />}
          title={t('noSuitesTitle')}
          description={t('noSuitesDescription')}
          action={
            <Button size="sm" onClick={() => setRunning(null)}>
              {t('runBuiltin')}
            </Button>
          }
          data-testid="evals-empty"
        />
      ) : (
        <div className="flex flex-col gap-8">
          {board.length ? <Leaderboard projectId={projectId} rows={board} /> : null}
          {suiteList.length ? (
            <Suites
              suites={suiteList}
              onRun={(suite) => setRunning({ kind: 'suite', name: suite })}
            />
          ) : null}
          <Jobs projectId={projectId} jobs={list} />
        </div>
      )}
    </CapabilityPageShell>
  );
}

function Change({ value }: { value: number | null }) {
  const t = useTranslations('evals');
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const points = Math.round(value * 1000) / 10;
  if (points === 0) return <span className="text-muted-foreground tabular-nums">±0</span>;
  const up = points > 0;
  const Arrow = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span
      className="text-foreground inline-flex items-center justify-end gap-1 tabular-nums"
      aria-label={t(up ? 'changeUp' : 'changeDown', {
        points: Math.abs(points),
      })}
    >
      <Arrow
        weight="bold"
        className={`size-3 ${up ? 'text-kortix-green' : 'text-kortix-red'}`}
        aria-hidden
      />
      {Math.abs(points)}
    </span>
  );
}

function Leaderboard({
  projectId,
  rows,
}: {
  projectId: string;
  rows: ReturnType<typeof leaderboard>;
}) {
  const t = useTranslations('evals');
  const router = useUiRouter();
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t('leaderboard')}
      data-testid="evals-leaderboard"
    >
      <SectionTitle title={t('leaderboard')} info={t('leaderboardInfo')} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colSuite')}</TableHead>
            <TableHead>{t('colAgent')}</TableHead>
            <TableHead className="text-right">{t('colScore')}</TableHead>
            <TableHead className="text-right">{t('colChange')}</TableHead>
            <TableHead className="hidden text-right sm:table-cell">{t('colRuns')}</TableHead>
            <TableHead className="hidden text-right md:table-cell">{t('colLast')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={`${row.suite}-${row.agent}-${row.model}`}
              className="hover:bg-hover cursor-pointer"
              onClick={() => router.push(evalJobHref(projectId, row.lastJob.job_id))}
              data-testid="evals-leaderboard-row"
            >
              <TableCell className="max-w-48 truncate font-medium">{row.suite}</TableCell>
              <TableCell className="text-muted-foreground max-w-64 truncate">
                {agentLabel(row.agent, row.model)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {percent(row.passAt1)}
              </TableCell>
              <TableCell className="text-right">
                <Change value={row.change} />
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                {row.jobs}
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-right md:table-cell">
                <LocalTime
                  value={row.lastJob.finished_at ?? row.lastJob.created_at}
                  options={EVAL_TIME}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function Suites({
  suites,
  onRun,
}: {
  suites: WorkspaceEvalSuite[];
  onRun: (suite: string) => void;
}) {
  const t = useTranslations('evals');
  return (
    <section className="flex flex-col gap-3" aria-label={t('suites')}>
      <SectionTitle title={t('suites')} info={t('suitesInfo')} />
      <div className={EVAL_FRAME}>
        <ul className="divide-border divide-y">
          {suites.map((suite) => {
            const score = suite.last_job ? evalJobScore(suite.last_job) : null;
            const agents = (suite.config?.agents ?? [])
              .map((agent) => agentLabel(agent.name, agent.model_name))
              .join(', ');
            const source =
              suite.source === 'config' && suite.config_path ? suite.config_path : null;
            return (
              <li
                key={suite.name}
                className="flex items-center gap-3 px-4 py-3"
                data-testid="evals-suite-row"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-foreground truncate text-sm font-medium">{suite.name}</span>
                  {suite.error ? (
                    <span className="text-muted-foreground line-clamp-2 text-xs">
                      <span className="text-foreground">{t('suiteError')}</span>
                      {`: ${suite.error}`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground truncate text-xs">
                      {[agents, source].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:inline">
                  {!suite.last_job
                    ? t('never')
                    : score?.passAt1 == null
                      ? null
                      : t('lastScore', { score: percent(score.passAt1) })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!suite.config}
                  onClick={() => onRun(suite.name)}
                  aria-label={t('runSuite', { suite: suite.name })}
                >
                  {t('run')}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Jobs({ projectId, jobs }: { projectId: string; jobs: WorkspaceEvalJob[] }) {
  const t = useTranslations('evals');
  const router = useUiRouter();
  return (
    <section className="flex flex-col gap-3" aria-label={t('jobs')}>
      <SectionTitle title={t('jobs')} />
      {jobs.length === 0 ? (
        <div className={`${EVAL_FRAME} text-muted-foreground px-4 py-6 text-center text-sm`}>
          {t('noJobs')}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colJob')}</TableHead>
              <TableHead>{t('colStatus')}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">{t('colTrials')}</TableHead>
              <TableHead className="text-right">{t('colScore')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('colCommit')}</TableHead>
              <TableHead className="hidden text-right md:table-cell">{t('colLast')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const score = evalJobScore(job);
              const s = job.stats;
              const href = evalJobHref(projectId, job.job_id);
              return (
                <TableRow
                  key={job.job_id}
                  className="hover:bg-hover cursor-pointer"
                  onClick={() => router.push(href)}
                  data-testid="evals-job-row"
                >
                  <TableCell className="max-w-72">
                    <Link
                      href={href}
                      className="text-foreground block truncate font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {job.job_name}
                    </Link>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[jobSource(job), score ? agentLabel(score.agent, score.model) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={jobTone(job)}>{t(`status.${job.status}`)}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                    {isOpenJob(job)
                      ? `${s.n_completed + s.n_errored + s.n_cancelled}/${s.n_total_trials}`
                      : s.n_total_trials}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {percent(score?.passAt1)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden font-mono text-xs md:table-cell">
                    {job.commit?.slice(0, 7) ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-right md:table-cell">
                    <LocalTime value={job.created_at} options={EVAL_TIME} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
