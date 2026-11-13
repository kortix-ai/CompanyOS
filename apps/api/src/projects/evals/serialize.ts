import type { EvalException, EvalJob, EvalJobStats, EvalTrial } from '@kortix/api-contract';
import { computeJobStats } from './scoring';
import { jobConfig, type EvalJobRow, type EvalTrialRow } from './store';
import { trialFolder } from './storage';
import { taskRefLabel, type EvalTaskRef } from './task-source';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export function serializeJob(row: EvalJobRow): EvalJob {
  const stats = row.stats as Partial<EvalJobStats>;
  return {
    job_id: row.jobId,
    project_id: row.projectId,
    suite: row.suite,
    job_name: row.jobName,
    status: row.status,
    commit: row.commitSha,
    ref: row.ref,
    config: jobConfig(row),
    stats: typeof stats.n_total_trials === 'number' ? (stats as EvalJobStats) : computeJobStats([], []),
    rerun_of: row.rerunOf,
    folder: row.folder,
    drive_id: row.driveId,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    started_at: iso(row.startedAt),
    finished_at: iso(row.finishedAt),
  };
}

export function serializeTrial(job: Pick<EvalJobRow, 'folder'>, row: EvalTrialRow): EvalTrial {
  const usage = row.usage;
  return {
    trial_id: row.trialId,
    job_id: row.jobId,
    trial_name: row.trialName,
    task_name: row.taskName,
    task_path: taskRefLabel(row.taskRef as unknown as EvalTaskRef),
    agent: row.agent,
    model: row.model,
    attempt: row.attempt,
    retry: row.retry,
    status: row.status,
    session_id: row.sessionId,
    rewards: row.rewards ?? null,
    reward_valid: row.rewardValid,
    exception: (row.exception as EvalException | null) ?? null,
    environment_setup: { started_at: iso(row.environmentStartedAt), finished_at: iso(row.environmentFinishedAt) },
    agent_execution: { started_at: iso(row.agentStartedAt), finished_at: iso(row.agentFinishedAt) },
    verifier: { started_at: iso(row.verifierStartedAt), finished_at: iso(row.verifierFinishedAt) },
    usage: usage ? { n_input_tokens: usage.n_input_tokens ?? 0, n_output_tokens: usage.n_output_tokens ?? 0, n_cache_tokens: usage.n_cache_tokens ?? 0 } : null,
    folder: trialFolder(job.folder, row.trialName),
    created_at: row.createdAt.toISOString(),
    started_at: iso(row.startedAt),
    finished_at: iso(row.finishedAt),
  };
}
