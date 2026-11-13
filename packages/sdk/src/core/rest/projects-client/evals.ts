/**
 * Evals (project flag `evals`): run agents on a list of tasks and score them.
 *
 * Kortix runs the Harbor task format (https://harborframework.com): a TASK is
 * an instruction, a sandbox and `tests/test.sh`, which writes the reward to
 * `/logs/verifier/reward.json` (named numbers) or `reward.txt` (one number). A
 * TRIAL is one agent's attempt at one task. A JOB is tasks × agents × attempts.
 * A SUITE is a job config under `evals:` in kortix.yaml, in the field names of
 * a Harbor job config, or `config: <path>` to a Harbor job config file.
 *
 * The API owns every rule (`/v1/workspaces/:workspaceId/evals/*`). The wire
 * types mirror `@kortix/api-contract` evals.ts; this package does not import it.
 */

import { backendApi } from '../../http/api-client';
import { unwrap } from './shared';

export type WorkspaceEvalJobStatus = 'queued' | 'running' | 'completed' | 'cancelled';
export type WorkspaceEvalTrialStatus = 'queued' | 'starting' | 'agent_running' | 'verifying' | 'completed' | 'errored' | 'cancelled';

export interface WorkspaceEvalAgentConfig {
  name: string;
  model_name?: string | null;
  override_timeout_sec?: number | null;
  max_timeout_sec?: number | null;
}

export interface WorkspaceEvalTaskSource {
  /** A repository path: one task folder, or a folder of task folders. */
  path?: string | null;
  /** A dataset of the Harbor registry, such as `terminal-bench`. */
  name?: string | null;
  version?: string | null;
  /** A public git repository (https); `path` is inside it. */
  git_url?: string | null;
  /** The commit, branch or tag of `git_url`. */
  git_commit_id?: string | null;
  task_names?: string[] | null;
  exclude_task_names?: string[] | null;
  n_tasks?: number | null;
}

/** A job config in Harbor's job config field names. */
export interface WorkspaceEvalJobConfig {
  job_name?: string | null;
  n_attempts: number;
  n_concurrent_trials: number;
  timeout_multiplier: number;
  agent_timeout_multiplier?: number | null;
  verifier_timeout_multiplier?: number | null;
  retry: { max_retries: number; include_exceptions?: string[] | null; exclude_exceptions?: string[] | null };
  override_error_policy: Record<string, Partial<WorkspaceEvalErrorPolicy>>;
  agents: WorkspaceEvalAgentConfig[];
  tasks: WorkspaceEvalTaskSource[];
  datasets: WorkspaceEvalTaskSource[];
  metrics: Array<{ type: 'mean' | 'sum' | 'min' | 'max' }>;
  environment: { sandbox?: string | null; delete: boolean };
  verifier: { disable: boolean; env: Record<string, string> };
}

export interface WorkspaceEvalErrorPolicy {
  should_retry: boolean;
  should_grade: boolean;
  has_valid_reward: boolean;
}

export interface WorkspaceEvalException {
  exception_type: string;
  exception_message: string;
  occurred_at: string;
  policy: WorkspaceEvalErrorPolicy;
}

export interface WorkspaceEvalTiming {
  started_at: string | null;
  finished_at: string | null;
}

/** The score of one agent × model over the job's tasks. */
export interface WorkspaceEvalAgentStats {
  agent: string;
  model: string | null;
  /** Trials whose reward counts. */
  n_trials: number;
  n_errors: number;
  /** One entry per metric of the job: `{ mean: 0.5 }`, or one value per reward key. */
  metrics: Array<Record<string, number>>;
  /** `k` → share of tasks with a pass in their first `k` attempts. */
  pass_at_k: Record<string, number>;
}

export interface WorkspaceEvalJobStats {
  n_total_trials: number;
  n_queued: number;
  n_running: number;
  n_completed: number;
  n_errored: number;
  n_cancelled: number;
  agents: WorkspaceEvalAgentStats[];
}

export interface WorkspaceEvalJob {
  job_id: string;
  project_id: string;
  suite: string | null;
  job_name: string;
  status: WorkspaceEvalJobStatus;
  /** The commit the tasks and the config were read at. */
  commit: string | null;
  ref: string | null;
  config: WorkspaceEvalJobConfig;
  stats: WorkspaceEvalJobStats;
  rerun_of: string | null;
  /** The job's folder in Files. */
  folder: string;
  drive_id: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface WorkspaceEvalTrial {
  trial_id: string;
  job_id: string;
  trial_name: string;
  task_name: string;
  task_path: string;
  agent: string;
  model: string | null;
  attempt: number;
  retry: number;
  status: WorkspaceEvalTrialStatus;
  session_id: string | null;
  rewards: Record<string, number> | null;
  reward_valid: boolean;
  exception: WorkspaceEvalException | null;
  environment_setup: WorkspaceEvalTiming;
  agent_execution: WorkspaceEvalTiming;
  verifier: WorkspaceEvalTiming;
  usage: { n_input_tokens: number; n_output_tokens: number; n_cache_tokens: number } | null;
  folder: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface WorkspaceEvalSuite {
  name: string;
  source: 'inline' | 'config';
  config_path: string | null;
  /** Null when the suite does not resolve; `error` says why. */
  config: WorkspaceEvalJobConfig | null;
  error: string | null;
  warnings: string[];
  last_job: WorkspaceEvalJob | null;
}

export interface WorkspaceEvalTask {
  name: string;
  path: string;
  instruction: string;
  agent_timeout_sec: number;
  verifier_timeout_sec: number;
  has_solution: boolean;
  environment: string | null;
  metadata: Record<string, unknown>;
  /** Why Kortix cannot run this task, or null. */
  unsupported: string | null;
}

export interface WorkspaceEvalTrialDetail {
  trial: WorkspaceEvalTrial;
  instruction: string | null;
  files: Array<{ path: string; size: number }>;
}

export interface WorkspaceEvalDataset {
  name: string;
  version: string;
  description: string;
  n_tasks: number;
}

export interface StartWorkspaceEvalJobInput {
  /** A suite of `evals:`. `config` overrides its fields, or is the whole config without one. */
  suite?: string;
  config?: Partial<WorkspaceEvalJobConfig>;
  /** Branch or commit the tasks are read at. */
  ref?: string;
}

export interface RerunWorkspaceEvalJobInput {
  /** `failed`: reward below 1 or none. `errored`: ended with an exception. */
  scope?: 'all' | 'failed' | 'errored';
  trial_ids?: string[];
}

function segment(value: string, what: string): string {
  if (value === '.' || value === '..' || !value) {
    throw new Error(`Refused the ${what} "${value}": a "." or ".." segment would send the request to another endpoint. Pass ids exactly as Kortix prints them.`);
  }
  return encodeURIComponent(value);
}

const evalsPath = (projectId: string) => `/workspaces/${segment(projectId, 'workspace id')}/evals`;
const jobPath = (projectId: string, jobId: string) => `${evalsPath(projectId)}/jobs/${segment(jobId, 'job id')}`;
const trialPath = (projectId: string, jobId: string, trialId: string) => `${jobPath(projectId, jobId)}/trials/${segment(trialId, 'trial id')}`;

function query(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== null && entry[1] !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : '';
}

/** The suites of `evals:` at `ref` (default: the default branch), each with its latest job. */
export async function listWorkspaceEvalSuites(projectId: string, options?: { ref?: string }): Promise<WorkspaceEvalSuite[]> {
  return unwrap(await backendApi.get<{ suites: WorkspaceEvalSuite[] }>(`${evalsPath(projectId)}${query({ ref: options?.ref })}`), 'Eval suites request failed').suites;
}

/** The tasks a suite selects, or the tasks under a repository path. */
export async function listWorkspaceEvalTasks(
  projectId: string,
  options: { suite?: string; path?: string; ref?: string },
): Promise<{ commit: string | null; tasks: WorkspaceEvalTask[] }> {
  return unwrap(await backendApi.get<{ commit: string | null; tasks: WorkspaceEvalTask[] }>(`${evalsPath(projectId)}/tasks${query(options)}`), 'Eval tasks request failed');
}

/** The datasets of the Harbor registry a suite can name. */
export async function listWorkspaceEvalDatasets(projectId: string): Promise<WorkspaceEvalDataset[]> {
  return unwrap(await backendApi.get<{ datasets: WorkspaceEvalDataset[] }>(`${evalsPath(projectId)}/datasets`), 'Eval datasets request failed').datasets;
}

/** Jobs, newest first. Pass `next_cursor` back as `cursor` for the next page. */
export async function listWorkspaceEvalJobs(
  projectId: string,
  options?: { suite?: string; limit?: number; cursor?: string },
): Promise<{ jobs: WorkspaceEvalJob[]; next_cursor: string | null }> {
  return unwrap(
    await backendApi.get<{ jobs: WorkspaceEvalJob[]; next_cursor: string | null }>(`${evalsPath(projectId)}/jobs${query({ suite: options?.suite, limit: options?.limit, cursor: options?.cursor })}`),
    'Eval jobs request failed',
  );
}

/** Plan and queue a job. Throws `ApiError` 422 (`eval_invalid`, with `violations`) when the config does not resolve. */
export async function startWorkspaceEvalJob(projectId: string, input: StartWorkspaceEvalJobInput): Promise<WorkspaceEvalJob> {
  // No host error toast: every caller shows the refusal itself (the CLI prints it, the Run modal keeps it inline).
  return unwrap(await backendApi.post<{ job: WorkspaceEvalJob }>(`${evalsPath(projectId)}/jobs`, input, { showErrors: false }), 'Eval job start failed').job;
}

export async function getWorkspaceEvalJob(projectId: string, jobId: string): Promise<WorkspaceEvalJob> {
  return unwrap(await backendApi.get<{ job: WorkspaceEvalJob }>(jobPath(projectId, jobId)), 'Eval job request failed').job;
}

export async function listWorkspaceEvalTrials(projectId: string, jobId: string): Promise<WorkspaceEvalTrial[]> {
  return unwrap(await backendApi.get<{ trials: WorkspaceEvalTrial[] }>(`${jobPath(projectId, jobId)}/trials`), 'Eval trials request failed').trials;
}

export async function getWorkspaceEvalTrial(projectId: string, jobId: string, trialId: string): Promise<WorkspaceEvalTrialDetail> {
  return unwrap(await backendApi.get<WorkspaceEvalTrialDetail>(trialPath(projectId, jobId, trialId)), 'Eval trial request failed');
}

/** One file of a trial's folder, as text (`result.json`, `verifier/test-stdout.txt`, …). */
export async function readWorkspaceEvalTrialFile(projectId: string, jobId: string, trialId: string, path: string): Promise<string> {
  const response = await backendApi.get<unknown>(`${trialPath(projectId, jobId, trialId)}/file${query({ path })}`);
  const data = unwrap(response, 'Eval trial file request failed');
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

/** A new job that runs trials of this one again, at the same commit and config. */
export async function rerunWorkspaceEvalJob(projectId: string, jobId: string, input: RerunWorkspaceEvalJobInput = {}): Promise<WorkspaceEvalJob> {
  return unwrap(await backendApi.post<{ job: WorkspaceEvalJob }>(`${jobPath(projectId, jobId)}/rerun`, input), 'Eval job rerun failed').job;
}

/** No queued trial starts; every running trial ends `cancelled` with its sandbox stopped. */
export async function cancelWorkspaceEvalJob(projectId: string, jobId: string): Promise<WorkspaceEvalJob> {
  return unwrap(await backendApi.post<{ job: WorkspaceEvalJob }>(`${jobPath(projectId, jobId)}/cancel`, {}), 'Eval job cancel failed').job;
}

/** Delete an ended job and its folder in Files. A running job throws `ApiError` 409. */
export async function deleteWorkspaceEvalJob(projectId: string, jobId: string): Promise<void> {
  unwrap(await backendApi.delete<{ ok: true }>(jobPath(projectId, jobId)), 'Eval job delete failed');
}

// ── Scores ───────────────────────────────────────────────────────────────────

/**
 * One trial in two numbers. `passed`: every reward is 1 or more (Harbor's
 * pass). `score`: the mean of its rewards. Both count only a valid reward.
 */
export function evalTrialScore(trial: Pick<WorkspaceEvalTrial, 'rewards' | 'reward_valid'>): { passed: boolean; score: number | null } {
  const values = trial.reward_valid ? Object.values(trial.rewards ?? {}) : [];
  if (values.length === 0) return { passed: false, score: null };
  return { passed: values.every((value) => value >= 1), score: values.reduce((a, b) => a + b, 0) / values.length };
}

export interface WorkspaceEvalJobScore {
  agent: string;
  model: string | null;
  /** Share of tasks the agent passed on its first attempt. */
  passAt1: number | null;
  /** The job's first metric, when it has one value. */
  metric: { name: string; value: number } | null;
  validTrials: number;
  errors: number;
}

/** A job's headline: the agent × model with the highest pass@1. Null before any trial counts. */
export function evalJobScore(job: Pick<WorkspaceEvalJob, 'stats'>): WorkspaceEvalJobScore | null {
  const ranked = [...(job.stats.agents ?? [])].sort((a, b) => (b.pass_at_k['1'] ?? -1) - (a.pass_at_k['1'] ?? -1));
  const best = ranked[0];
  if (!best) return null;
  const first = best.metrics[0] ?? {};
  const keys = Object.keys(first);
  return {
    agent: best.agent,
    model: best.model,
    passAt1: best.pass_at_k['1'] ?? null,
    metric: keys.length === 1 ? { name: keys[0]!, value: first[keys[0]!]! } : null,
    validTrials: best.n_trials,
    errors: best.n_errors,
  };
}
