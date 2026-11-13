/**
 * Evals: what a person asks for. List the suites of kortix.yaml and their
 * tasks, start a job, cancel it, run trials again, delete it. The runner
 * (`runner.ts`) does the work of a job once it exists.
 */
import type { CreateEvalJobRequest, EvalJobConfig, EvalSuite, EvalTask, EvalTrialDetailResponse, RerunEvalJobRequest } from '@kortix/api-contract';
import { resolveCommitSha } from '../git';
import { withProjectGitAuth } from '../lib/git';
import type { ProjectRow } from '../lib/serializers';
import { EvalConfigError, planTasks, planTrials, readManifestEvals, resolveSuite, unknownAgents, type PlannedTrial, type ResolvedSuite } from './config';
import { stopTrialSandbox } from './runner';
import { serializeJob, serializeTrial } from './serialize';
import { evalsDrive, jobFolder, json, listEvalFiles, removeEvalFolder, trialFolder, writeEvalFiles } from './storage';
import { cancelOpenTrials, deleteJob, getJob, getTrial, insertJob, jobConfig, latestJobBySuite, listTrials, refreshJobStats, setJobStatus, type EvalJobRow, type EvalTrialRow } from './store';
import { loadTask, treeFor, type EvalTaskRef } from './task-source';
import type { HarborTask } from './harbor-task';
import type { PlannedTask } from './config';

export class EvalNotFoundError extends Error {}
export class EvalConflictError extends Error {}

const commitOf = async (project: ProjectRow, ref?: string | null) => {
  const gitProject = await withProjectGitAuth(project);
  try {
    return { gitProject, commit: await resolveCommitSha(gitProject, ref ?? undefined) };
  } catch {
    throw new EvalConfigError([`The ref ${ref ?? gitProject.defaultBranch} does not resolve to a commit of this project's repository.`]);
  }
};

export const toWireTask = (planned: { name: string; ref: EvalTaskRef; task: HarborTask }): EvalTask => ({
  name: planned.name,
  path: planned.ref.kind === 'repo' ? planned.ref.path : `${planned.ref.git_url}@${planned.ref.commit.slice(0, 7)}:${planned.ref.path}`,
  instruction: planned.task.instruction,
  agent_timeout_sec: planned.task.agentTimeoutSec,
  verifier_timeout_sec: planned.task.verifierTimeoutSec,
  has_solution: planned.task.hasSolution,
  environment: planned.task.dockerImage ?? (planned.task.hasDockerfile ? 'environment/Dockerfile' : null),
  metadata: planned.task.metadata,
  unsupported: planned.task.unsupported,
});

const toWireSuite = (suite: ResolvedSuite, lastJob: EvalJobRow | undefined): EvalSuite => ({
  name: suite.name,
  source: suite.source,
  config_path: suite.configPath,
  config: suite.config,
  error: suite.error,
  warnings: suite.warnings,
  last_job: lastJob ? serializeJob(lastJob) : null,
});

/** The suites of `evals:` at the tip of the default branch (or `ref`), each resolved. */
export async function listSuites(project: ProjectRow, ref?: string | null): Promise<EvalSuite[]> {
  const { gitProject, commit } = await commitOf(project, ref);
  const manifest = await readManifestEvals(gitProject, commit);
  const latest = await latestJobBySuite(project.projectId);
  const suites: EvalSuite[] = [];
  for (const declared of manifest.suites) {
    const resolved = await resolveSuite(gitProject, commit, declared);
    const unknown = resolved.config ? unknownAgents(resolved.config, manifest.agents) : [];
    if (unknown.length) resolved.warnings.push(`Not an agent of this project: ${unknown.join(', ')}.`);
    suites.push(toWireSuite(resolved, latest.get(declared.name)));
  }
  return suites;
}

async function resolveConfig(project: ProjectRow, input: { suite?: string; config?: Record<string, unknown>; ref?: string | null }) {
  const { gitProject, commit } = await commitOf(project, input.ref);
  const manifest = await readManifestEvals(gitProject, commit);
  let declared = input.suite ? manifest.suites.find((suite) => suite.name === input.suite) : undefined;
  if (input.suite && !declared) {
    const names = manifest.suites.map((suite) => suite.name);
    throw new EvalConfigError([`kortix.yaml has no eval suite named "${input.suite}" at ${commit.slice(0, 7)}.${names.length ? ` Suites: ${names.join(', ')}.` : ' It declares no `evals:` section.'}`]);
  }
  declared ??= { name: '', configPath: null, config: {}, issues: [] };
  const resolved = await resolveSuite(gitProject, commit, declared, input.config);
  if (!resolved.config) throw new EvalConfigError([resolved.error ?? 'The eval config is not valid.']);
  const unknown = unknownAgents(resolved.config, manifest.agents);
  if (unknown.length) throw new EvalConfigError([`Not an agent of this project: ${unknown.join(', ')}. Name an agent of kortix.yaml, \`oracle\` or \`nop\`.`]);
  return { gitProject, commit, config: resolved.config, warnings: resolved.warnings };
}

/** The tasks a suite (or an ad-hoc config) selects, parsed. */
export async function listTasks(project: ProjectRow, input: { suite?: string; path?: string; ref?: string | null }): Promise<{ commit: string; tasks: EvalTask[] }> {
  const { gitProject, commit, config } = await resolveConfig(project, {
    suite: input.suite,
    ...(input.path ? { config: { tasks: [{ path: input.path }], datasets: [] } } : {}),
    ref: input.ref,
  });
  return { commit, tasks: (await planTasks(gitProject, commit, config)).map(toWireTask) };
}

const stamp = (now: Date): string => now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const safeName = (value: string): string => value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '').slice(0, 100) || 'job';

async function insertNamedJob(
  project: ProjectRow,
  userId: string,
  input: { suite: string | null; baseName: string; commit: string; ref: string | null; config: EvalJobConfig; trials: PlannedTrial[]; rerunOf: string | null },
): Promise<EvalJobRow> {
  const drive = await evalsDrive(project.accountId, project.projectId);
  for (let n = 1; n <= 20; n += 1) {
    const jobName = n === 1 ? input.baseName : `${input.baseName}-${n}`;
    const job = await insertJob({
      projectId: project.projectId,
      accountId: project.accountId,
      suite: input.suite,
      jobName,
      commitSha: input.commit,
      ref: input.ref,
      config: { ...input.config, job_name: jobName },
      rerunOf: input.rerunOf,
      driveId: drive.driveId,
      folder: jobFolder(jobName),
      createdBy: userId,
      trials: input.trials,
    });
    if (!job) continue;
    await refreshJobStats(job);
    // The folder starts with the config, as a Harbor job directory does. A storage failure does not stop the job.
    await writeEvalFiles(drive, job.folder, [{ path: 'config.json', content: json({ ...jobConfig(job), commit: input.commit, suite: input.suite }) }]).catch(() => undefined);
    return (await getJob(project.projectId, job.jobId)) ?? job;
  }
  throw new EvalConflictError('A job of this name exists. Set another `job_name`.');
}

/** Plan and queue a job. The runner starts its trials on its next tick. */
export async function createJob(project: ProjectRow, userId: string, request: CreateEvalJobRequest, now: Date = new Date()): Promise<EvalJobRow> {
  const { gitProject, commit, config } = await resolveConfig(project, { suite: request.suite, config: request.config as Record<string, unknown> | undefined, ref: request.ref });
  const tasks: PlannedTask[] = await planTasks(gitProject, commit, config);
  const trials = planTrials(config, tasks);
  const baseName = safeName(config.job_name ?? `${request.suite ?? 'eval'}-${stamp(now)}`);
  return insertNamedJob(project, userId, { suite: request.suite ?? null, baseName, commit, ref: request.ref ?? null, config, trials, rerunOf: null });
}

/** A reward below 1, or none. */
const failed = (trial: EvalTrialRow): boolean => {
  const values = Object.values(trial.rewards ?? {});
  return values.length === 0 || values.some((value) => value < 1);
};

/** A new job that runs trials of an ended job again, at the same commit and config. */
export async function rerunJob(project: ProjectRow, userId: string, jobId: string, request: RerunEvalJobRequest, now: Date = new Date()): Promise<EvalJobRow> {
  const job = await getJob(project.projectId, jobId);
  if (!job) throw new EvalNotFoundError();
  const all = await listTrials(job.jobId);
  // The last run of each attempt stands for it.
  const lastRun = new Map<string, EvalTrialRow>();
  for (const trial of all) {
    const key = `${trial.taskName}\u0000${trial.agent}\u0000${trial.model ?? ''}\u0000${trial.attempt}`;
    if (!lastRun.has(key) || lastRun.get(key)!.retry < trial.retry) lastRun.set(key, trial);
  }
  const ids = request.trial_ids ? new Set(request.trial_ids) : null;
  const scope = request.scope ?? 'all';
  const picked = [...lastRun.values()].filter((trial) =>
    ids ? ids.has(trial.trialId) || all.some((other) => ids.has(other.trialId) && other.trialName.replace(/__r\d+$/, '') === trial.trialName.replace(/__r\d+$/, '')) : scope === 'all' ? true : scope === 'errored' ? trial.exception !== null : failed(trial),
  );
  if (picked.length === 0) throw new EvalConfigError(['No trial of this job matches. Nothing to run again.']);
  const trials: PlannedTrial[] = picked.map((trial) => ({
    trialName: trial.trialName.replace(/__r\d+$/, ''),
    taskName: trial.taskName,
    taskRef: trial.taskRef as unknown as EvalTaskRef,
    agent: trial.agent,
    model: trial.model,
    attempt: trial.attempt,
  }));
  if (!job.commitSha) throw new EvalConfigError(['This job records no commit, so it cannot run again.']);
  return insertNamedJob(project, userId, {
    suite: job.suite,
    baseName: safeName(`${job.jobName.replace(/-rerun-\d{8}-\d{6}(-\d+)?$/, '')}-rerun-${stamp(now)}`),
    commit: job.commitSha,
    ref: job.ref,
    config: jobConfig(job),
    trials,
    rerunOf: job.jobId,
  });
}

/** Cancel a job: no queued trial starts, and every running trial's sandbox stops. */
export async function cancelJob(project: ProjectRow, jobId: string, now: Date = new Date()): Promise<EvalJobRow> {
  const job = await getJob(project.projectId, jobId);
  if (!job) throw new EvalNotFoundError();
  if (job.status === 'completed' || job.status === 'cancelled') return job;
  const cancelled = await cancelOpenTrials(job.jobId);
  await setJobStatus(job.jobId, ['queued', 'running'], { status: 'cancelled', finishedAt: now });
  await Promise.all(cancelled.filter((trial) => trial.sessionId).map((trial) => stopTrialSandbox(job, trial.sessionId!)));
  await refreshJobStats(job);
  return (await getJob(project.projectId, jobId)) ?? job;
}

/** Delete an ended job: its rows and its folder in Files. The trial sessions stay. */
export async function removeJob(project: ProjectRow, jobId: string): Promise<void> {
  const job = await getJob(project.projectId, jobId);
  if (!job) throw new EvalNotFoundError();
  if (job.status === 'queued' || job.status === 'running') throw new EvalConflictError('Cancel the job before you delete it.');
  await deleteJob(project.projectId, jobId);
  await removeEvalFolder(job.driveId, job.folder);
}

export async function trialDetail(project: ProjectRow, jobId: string, trialId: string): Promise<EvalTrialDetailResponse> {
  const job = await getJob(project.projectId, jobId);
  const trial = job ? await getTrial(job.jobId, trialId) : null;
  if (!job || !trial) throw new EvalNotFoundError();
  const ref = trial.taskRef as unknown as EvalTaskRef;
  const gitProject = await withProjectGitAuth(project);
  const [instruction, files] = await Promise.all([
    loadTask(treeFor(gitProject, job.commitSha ?? gitProject.defaultBranch, ref), ref).then((task) => task.instruction, () => null),
    listEvalFiles(job.driveId, trialFolder(job.folder, trial.trialName)).catch(() => []),
  ]);
  return { trial: serializeTrial(job, trial), instruction, files };
}
