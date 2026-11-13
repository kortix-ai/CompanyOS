'use client';

import { useTranslations } from '@/i18n/use-translations';
import type { WorkspaceEvalJob, WorkspaceEvalSuite } from '@kortix/sdk';
import { useWorkspaceEvalJobs, useWorkspaceEvalSuites } from '@kortix/sdk/react';
import { Badge } from '@kortix/ui/badge';
import { Button } from '@kortix/ui/button';
import { EmptyArt } from '@kortix/ui/empty-art';
import { EmptyState } from '@kortix/ui/empty-state';
import { ErrorState } from '@kortix/ui/error-state';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@kortix/ui/hover-card';
import { LocalTime } from '@kortix/ui/local-time';
import { Skeleton } from '@kortix/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@kortix/ui/table';
import { ProjectPageHeader } from '@kortix/ui/workspace';
import { ChartBarIcon, InfoIcon, PlayIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { agentLabel, evalJobScore, isOpenJob, jobSource, leaderboard, percent } from './eval-meta';
import { RunEvalModal } from './run-eval-modal';

/** A job's time: day and minute, in the viewer's zone. */
const WHEN: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };

export const evalsHref = (projectId: string) => `/workspaces/${projectId}/evals`;
export const evalJobHref = (projectId: string, jobId: string) => `${evalsHref(projectId)}/jobs/${jobId}`;

/**
 * /workspaces/[id]/evals — the leaderboard (each suite × agent × model, its
 * latest score and the change since the job before), the suites of
 * kortix.yaml with a Run action, and every job. The job list re-reads every
 * 5 seconds while a job runs.
 */
export function EvalsPage({ projectId }: { projectId: string }) {
  const t = useTranslations('evals');
  const suites = useWorkspaceEvalSuites(projectId);
  const jobs = useWorkspaceEvalJobs(projectId);
  const [running, setRunning] = useState<string | null | false>(false);
  const list = jobs.data ?? [];
  const board = leaderboard(list);
  const hasSuites = (suites.data ?? []).length > 0;

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <ProjectPageHeader title={t('title')}>
        {hasSuites ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRunning(null)} data-testid="evals-run">
            <PlayIcon className="size-3.5 shrink-0" aria-hidden />
            {t('run')}
          </Button>
        ) : null}
      </ProjectPageHeader>
      <RunEvalModal
        projectId={projectId}
        suites={suites.data ?? []}
        suite={running || null}
        open={running !== false}
        onOpenChange={(open) => !open && setRunning(false)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-8 px-4 py-6 pb-20 md:px-8">
          {suites.isError || jobs.isError ? (
            <ErrorState
              size="sm"
              title={t('loadError')}
              action={
                <Button size="sm" variant="outline" onClick={() => void Promise.all([suites.refetch(), jobs.refetch()])}>
                  {t('retry')}
                </Button>
              }
            />
          ) : suites.isLoading || jobs.isLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : !hasSuites && list.length === 0 ? (
            <EmptyState
              media={<EmptyArt icon={ChartBarIcon} />}
              title={t('noSuitesTitle')}
              description={t('noSuitesDescription')}
              data-testid="evals-empty"
            />
          ) : (
            <>
              {board.length ? <Leaderboard projectId={projectId} rows={board} /> : null}
              {hasSuites ? <Suites suites={suites.data ?? []} onRun={(suite) => setRunning(suite)} /> : null}
              <Jobs projectId={projectId} jobs={list} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, info }: { title: string; info?: string }) {
  return (
    <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
      {title}
      {info ? (
        <HoverCard openDelay={150}>
          <HoverCardTrigger asChild>
            <button type="button" aria-label={info} className="text-muted-foreground hover:text-foreground">
              <InfoIcon className="size-3.5" />
            </button>
          </HoverCardTrigger>
          <HoverCardContent className="text-muted-foreground w-72 text-xs">{info}</HoverCardContent>
        </HoverCard>
      ) : null}
    </h2>
  );
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const points = Math.round(value * 1000) / 10;
  if (points === 0) return <span className="text-muted-foreground tabular-nums">±0</span>;
  return (
    <span className={`tabular-nums ${points > 0 ? 'text-kortix-green' : 'text-kortix-red'}`}>
      {points > 0 ? '+' : ''}
      {points}
    </span>
  );
}

function Leaderboard({ projectId, rows }: { projectId: string; rows: ReturnType<typeof leaderboard> }) {
  const t = useTranslations('evals');
  const router = useRouter();
  return (
    <section className="flex flex-col gap-2" aria-label={t('leaderboard')} data-testid="evals-leaderboard">
      <SectionTitle title={t('leaderboard')} info={t('leaderboardInfo')} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colSuite')}</TableHead>
            <TableHead>{t('colAgent')}</TableHead>
            <TableHead className="text-right">{t('colScore')}</TableHead>
            <TableHead className="text-right">{t('colChange')}</TableHead>
            <TableHead className="text-right">{t('colRuns')}</TableHead>
            <TableHead className="text-right">{t('colLast')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={`${row.suite}-${row.agent}-${row.model}`}
              className="cursor-pointer"
              onClick={() => router.push(evalJobHref(projectId, row.lastJob.job_id))}
              data-testid="evals-leaderboard-row"
            >
              <TableCell className="font-medium">{row.suite}</TableCell>
              <TableCell className="text-muted-foreground">{agentLabel(row.agent, row.model)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{percent(row.passAt1)}</TableCell>
              <TableCell className="text-right">
                <Change value={row.change} />
              </TableCell>
              <TableCell className="text-muted-foreground text-right tabular-nums">{row.jobs}</TableCell>
              <TableCell className="text-muted-foreground text-right">
                <LocalTime value={row.lastJob.finished_at ?? row.lastJob.created_at} options={WHEN} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function Suites({ suites, onRun }: { suites: WorkspaceEvalSuite[]; onRun: (suite: string) => void }) {
  const t = useTranslations('evals');
  return (
    <section className="flex flex-col gap-2" aria-label={t('suites')}>
      <SectionTitle title={t('suites')} info={t('suitesInfo')} />
      <ul className="flex flex-col">
        {suites.map((suite) => {
          const score = suite.last_job ? evalJobScore(suite.last_job) : null;
          const agents = (suite.config?.agents ?? []).map((agent) => agentLabel(agent.name, agent.model_name)).join(', ');
          return (
            <li key={suite.name} className="hover:bg-hover flex items-center gap-3 rounded-md px-3 py-2.5" data-testid="evals-suite-row">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-foreground truncate text-sm font-medium">{suite.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {suite.error ? <span className="text-kortix-red">{`${t('suiteError')}: ${suite.error}`}</span> : agents}
                  {suite.source === 'config' && suite.config_path ? ` · ${suite.config_path}` : ''}
                </span>
              </span>
              <span className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:inline">
                {suite.last_job ? `${t('lastJob')} ${percent(score?.passAt1)}` : t('never')}
              </span>
              <Button size="sm" variant="outline" disabled={!suite.config} onClick={() => onRun(suite.name)} aria-label={t('runSuite', { suite: suite.name })}>
                {t('run')}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function JobStatus({ job }: { job: WorkspaceEvalJob }) {
  const t = useTranslations('evals');
  const variant = job.status === 'completed' ? (job.stats.n_errored ? 'warning' : 'success') : job.status === 'cancelled' ? 'muted' : 'info';
  return <Badge variant={variant}>{t(`status.${job.status}`)}</Badge>;
}

function Jobs({ projectId, jobs }: { projectId: string; jobs: WorkspaceEvalJob[] }) {
  const t = useTranslations('evals');
  return (
    <section className="flex flex-col gap-2" aria-label={t('jobs')}>
      <SectionTitle title={t('jobs')} />
      {jobs.length === 0 ? (
        <p className="text-muted-foreground px-3 text-sm">{t('noJobs')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colJob')}</TableHead>
              <TableHead>{t('colStatus')}</TableHead>
              <TableHead className="text-right">{t('colTrials')}</TableHead>
              <TableHead className="text-right">{t('colScore')}</TableHead>
              <TableHead>{t('colCommit')}</TableHead>
              <TableHead className="text-right">{t('colLast')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const score = evalJobScore(job);
              const s = job.stats;
              return (
                <TableRow key={job.job_id} data-testid="evals-job-row">
                  <TableCell className="max-w-72">
                    <Link href={evalJobHref(projectId, job.job_id)} className="text-foreground block truncate font-medium hover:underline">
                      {job.job_name}
                    </Link>
                    <span className="text-muted-foreground block truncate text-xs">{[jobSource(job), score ? agentLabel(score.agent, score.model) : null].filter(Boolean).join(' · ')}</span>
                  </TableCell>
                  <TableCell>
                    <JobStatus job={job} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {isOpenJob(job) ? `${s.n_completed + s.n_errored + s.n_cancelled}/${s.n_total_trials}` : s.n_total_trials}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{percent(score?.passAt1)}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{job.commit?.slice(0, 7) ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-right">
                    <LocalTime value={job.created_at} options={WHEN} />
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
