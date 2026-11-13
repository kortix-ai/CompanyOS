/**
 * The `eval_jobs` and `eval_trials` rows: the index of a job's folder in
 * Files, and the runner's queue state. Every write of a trial names the status
 * it expects, so a cancel and a runner step cannot overwrite each other.
 */
import { evalJobs, evalTrials } from '@kortix/db';
import type { EvalJobConfig, EvalJobStats, EvalTrialStatus } from '@kortix/api-contract';
import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '../../shared/db';
import type { PlannedTrial } from './config';
import { computeJobStats } from './scoring';

export type EvalJobRow = typeof evalJobs.$inferSelect;
export type EvalTrialRow = typeof evalTrials.$inferSelect;

export const ACTIVE_TRIAL_STATUSES: EvalTrialStatus[] = ['starting', 'agent_running', 'verifying'];
export const OPEN_TRIAL_STATUSES: EvalTrialStatus[] = ['queued', ...ACTIVE_TRIAL_STATUSES];

export const jobConfig = (job: EvalJobRow): EvalJobConfig => job.config as unknown as EvalJobConfig;

export async function insertJob(input: {
  projectId: string;
  accountId: string;
  suite: string | null;
  jobName: string;
  commitSha: string;
  ref: string | null;
  config: EvalJobConfig;
  rerunOf: string | null;
  driveId: string;
  folder: string;
  createdBy: string;
  trials: PlannedTrial[];
}): Promise<EvalJobRow | null> {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .insert(evalJobs)
      .values({
        projectId: input.projectId,
        accountId: input.accountId,
        suite: input.suite,
        jobName: input.jobName,
        commitSha: input.commitSha,
        ref: input.ref,
        config: input.config as unknown as Record<string, unknown>,
        rerunOf: input.rerunOf,
        driveId: input.driveId,
        folder: input.folder,
        createdBy: input.createdBy,
      })
      .onConflictDoNothing({ target: [evalJobs.projectId, evalJobs.jobName] })
      .returning();
    // A job of this name exists in the project.
    if (!job) return null;
    for (let i = 0; i < input.trials.length; i += 500) {
      await tx.insert(evalTrials).values(
        input.trials.slice(i, i + 500).map((trial) => ({
          jobId: job.jobId,
          projectId: input.projectId,
          trialName: trial.trialName,
          taskName: trial.taskName,
          taskRef: trial.taskRef as unknown as Record<string, unknown>,
          agent: trial.agent,
          model: trial.model,
          attempt: trial.attempt,
        })),
      );
    }
    return job;
  });
}

export async function getJob(projectId: string, jobId: string): Promise<EvalJobRow | null> {
  const [row] = await db.select().from(evalJobs).where(and(eq(evalJobs.projectId, projectId), eq(evalJobs.jobId, jobId))).limit(1);
  return row ?? null;
}

export async function listJobs(projectId: string, opts: { suite?: string; limit: number; before?: Date }): Promise<EvalJobRow[]> {
  return db
    .select()
    .from(evalJobs)
    .where(and(eq(evalJobs.projectId, projectId), opts.suite ? eq(evalJobs.suite, opts.suite) : undefined, opts.before ? lt(evalJobs.createdAt, opts.before) : undefined))
    .orderBy(desc(evalJobs.createdAt))
    .limit(opts.limit);
}

/** The latest job of each suite of a project. */
export async function latestJobBySuite(projectId: string): Promise<Map<string, EvalJobRow>> {
  const rows = await db
    .selectDistinctOn([evalJobs.suite])
    .from(evalJobs)
    .where(and(eq(evalJobs.projectId, projectId), sql`${evalJobs.suite} is not null`))
    .orderBy(evalJobs.suite, desc(evalJobs.createdAt));
  return new Map(rows.map((row) => [row.suite!, row]));
}

export async function deleteJob(projectId: string, jobId: string): Promise<boolean> {
  const deleted = await db.delete(evalJobs).where(and(eq(evalJobs.projectId, projectId), eq(evalJobs.jobId, jobId))).returning({ jobId: evalJobs.jobId });
  return deleted.length > 0;
}

export async function listTrials(jobId: string): Promise<EvalTrialRow[]> {
  return db.select().from(evalTrials).where(eq(evalTrials.jobId, jobId)).orderBy(asc(evalTrials.taskName), asc(evalTrials.agent), asc(evalTrials.attempt), asc(evalTrials.retry));
}

export async function getTrial(jobId: string, trialId: string): Promise<EvalTrialRow | null> {
  const [row] = await db.select().from(evalTrials).where(and(eq(evalTrials.jobId, jobId), eq(evalTrials.trialId, trialId))).limit(1);
  return row ?? null;
}

/** Jobs the runner still works on, oldest first. */
export async function listOpenJobs(limit: number): Promise<EvalJobRow[]> {
  return db.select().from(evalJobs).where(inArray(evalJobs.status, ['queued', 'running'])).orderBy(asc(evalJobs.createdAt)).limit(limit);
}

export async function listOpenTrials(jobId: string): Promise<EvalTrialRow[]> {
  return db.select().from(evalTrials).where(and(eq(evalTrials.jobId, jobId), inArray(evalTrials.status, OPEN_TRIAL_STATUSES))).orderBy(asc(evalTrials.createdAt), asc(evalTrials.trialName));
}

/**
 * Write a trial only while it still has the status the caller read. False: a
 * cancel (or another runner) moved it first, and the caller drops its step.
 */
export async function updateTrial(trial: Pick<EvalTrialRow, 'trialId' | 'status'>, patch: Partial<typeof evalTrials.$inferInsert>): Promise<boolean> {
  const updated = await db
    .update(evalTrials)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(evalTrials.trialId, trial.trialId), eq(evalTrials.status, trial.status)))
    .returning({ trialId: evalTrials.trialId });
  return updated.length > 0;
}

/** Queue one more run of an attempt after a retryable error. */
export async function insertRetry(trial: EvalTrialRow): Promise<void> {
  const retry = trial.retry + 1;
  await db
    .insert(evalTrials)
    .values({
      jobId: trial.jobId,
      projectId: trial.projectId,
      trialName: `${trial.trialName.replace(/__r\d+$/, '')}__r${retry}`,
      taskName: trial.taskName,
      taskRef: trial.taskRef,
      agent: trial.agent,
      model: trial.model,
      attempt: trial.attempt,
      retry,
    })
    .onConflictDoNothing({ target: [evalTrials.jobId, evalTrials.trialName] });
}

/** Cancel every trial of a job that has not ended. Returns the ones that had a session. */
export async function cancelOpenTrials(jobId: string): Promise<EvalTrialRow[]> {
  const now = new Date();
  return db
    .update(evalTrials)
    .set({ status: 'cancelled', finishedAt: now, updatedAt: now })
    .where(and(eq(evalTrials.jobId, jobId), inArray(evalTrials.status, OPEN_TRIAL_STATUSES)))
    .returning();
}

export async function setJobStatus(jobId: string, from: EvalJobRow['status'][], patch: Partial<typeof evalJobs.$inferInsert>): Promise<boolean> {
  const updated = await db
    .update(evalJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(evalJobs.jobId, jobId), inArray(evalJobs.status, from)))
    .returning({ jobId: evalJobs.jobId });
  return updated.length > 0;
}

/** Recompute a job's stats from its trials and store them. */
export async function refreshJobStats(job: EvalJobRow): Promise<EvalJobStats> {
  const trials = await listTrials(job.jobId);
  // A run is superseded when a later retry of the same task × agent × model × attempt exists.
  const latest = new Map<string, number>();
  const key = (trial: EvalTrialRow) => `${trial.taskName}\u0000${trial.agent}\u0000${trial.model ?? ''}\u0000${trial.attempt}`;
  for (const trial of trials) latest.set(key(trial), Math.max(latest.get(key(trial)) ?? 0, trial.retry));
  const stats = computeJobStats(
    trials.map((trial) => ({
      taskName: trial.taskName,
      agent: trial.agent,
      model: trial.model,
      attempt: trial.attempt,
      status: trial.status,
      rewards: trial.rewards ?? null,
      rewardValid: trial.rewardValid,
      hasException: trial.exception !== null,
      superseded: trial.retry < (latest.get(key(trial)) ?? 0),
    })),
    jobConfig(job).metrics,
  );
  await db.update(evalJobs).set({ stats: stats as unknown as Record<string, unknown>, updatedAt: new Date() }).where(eq(evalJobs.jobId, job.jobId));
  return stats;
}

/** Trials that hold a slot, per project, for the per-project cap. */
export async function countActiveTrials(projectId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(evalTrials)
    .where(and(eq(evalTrials.projectId, projectId), or(...ACTIVE_TRIAL_STATUSES.map((status) => eq(evalTrials.status, status)))));
  return row?.n ?? 0;
}
