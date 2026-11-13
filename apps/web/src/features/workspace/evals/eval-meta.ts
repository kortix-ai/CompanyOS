import { evalJobScore, evalTrialScore, type WorkspaceEvalJob, type WorkspaceEvalTrial } from '@kortix/sdk';

/** `82.5%`, or an em dash with no value. */
export const percent = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${Math.round(value * 1000) / 10}%`;

export const isOpenJob = (job: Pick<WorkspaceEvalJob, 'status'>): boolean => job.status === 'queued' || job.status === 'running';

/** `agent` or `agent @ model`: the one label an agent × model goes by on every surface. */
export const agentLabel = (agent: string, model: string | null | undefined): string => (model ? `${agent} @ ${model}` : agent);

export type CellTone = 'pass' | 'fail' | 'error' | 'running' | 'queued' | 'cancelled';

/** What one trial's cell shows. */
export function trialTone(trial: WorkspaceEvalTrial): CellTone {
  if (trial.status === 'cancelled') return 'cancelled';
  if (trial.status === 'queued') return 'queued';
  if (trial.status === 'starting' || trial.status === 'agent_running' || trial.status === 'verifying') return 'running';
  const { passed, score } = evalTrialScore(trial);
  if (score === null) return trial.exception ? 'error' : 'fail';
  return passed ? 'pass' : 'fail';
}

/** The last run of each attempt stands for it: a retry replaces the run before it. */
export function latestRuns(trials: WorkspaceEvalTrial[]): WorkspaceEvalTrial[] {
  const last = new Map<string, WorkspaceEvalTrial>();
  for (const trial of trials) {
    const key = `${trial.task_name}\u0000${trial.agent}\u0000${trial.model ?? ''}\u0000${trial.attempt}`;
    const seen = last.get(key);
    if (!seen || seen.retry < trial.retry) last.set(key, trial);
  }
  return [...last.values()];
}

/**
 * What a job measured: its suite, else (a job started without one) its first
 * source: a registry dataset `terminal-bench@2.0`, or a repository path.
 */
export function jobSource(job: Pick<WorkspaceEvalJob, 'suite' | 'config'>): string {
  if (job.suite) return job.suite;
  const dataset = job.config.datasets?.find((source) => source.name);
  if (dataset?.name) return dataset.version ? `${dataset.name}@${dataset.version}` : dataset.name;
  return job.config.tasks?.[0]?.path ?? job.config.datasets?.[0]?.path ?? '—';
}

export interface LeaderboardRow {
  suite: string;
  agent: string;
  model: string | null;
  passAt1: number | null;
  /** Pass@1 change against the job before the latest one; null with one job. */
  change: number | null;
  jobs: number;
  lastJob: WorkspaceEvalJob;
}

/**
 * One row per suite × agent × model: the score of its latest completed job,
 * and the change against the completed job before it. `jobs` is newest first.
 */
export function leaderboard(jobs: WorkspaceEvalJob[]): LeaderboardRow[] {
  const series = new Map<string, Array<{ job: WorkspaceEvalJob; passAt1: number | null }>>();
  for (const job of jobs) {
    if (job.status !== 'completed') continue;
    for (const stats of job.stats.agents) {
      if (stats.n_trials === 0) continue;
      const key = `${jobSource(job)}\u0000${stats.agent}\u0000${stats.model ?? ''}`;
      series.set(key, [...(series.get(key) ?? []), { job, passAt1: stats.pass_at_k['1'] ?? null }]);
    }
  }
  const rows: LeaderboardRow[] = [];
  for (const [key, runs] of series) {
    const [suite, agent, model] = key.split('\u0000') as [string, string, string];
    const [latest, previous] = runs;
    rows.push({
      suite,
      agent,
      model: model || null,
      passAt1: latest!.passAt1,
      change: previous && latest!.passAt1 !== null && previous.passAt1 !== null ? latest!.passAt1 - previous.passAt1 : null,
      jobs: runs.length,
      lastJob: latest!.job,
    });
  }
  return rows.sort((a, b) => a.suite.localeCompare(b.suite) || (b.passAt1 ?? -1) - (a.passAt1 ?? -1));
}

export { evalJobScore, evalTrialScore };
