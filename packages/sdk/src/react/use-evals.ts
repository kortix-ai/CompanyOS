'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelWorkspaceEvalJob,
  deleteWorkspaceEvalJob,
  getWorkspaceEvalJob,
  getWorkspaceEvalTrial,
  listWorkspaceEvalJobs,
  listWorkspaceEvalSuites,
  listWorkspaceEvalTasks,
  listWorkspaceEvalTrials,
  readWorkspaceEvalTrialFile,
  rerunWorkspaceEvalJob,
  startWorkspaceEvalJob,
  type RerunWorkspaceEvalJobInput,
  type StartWorkspaceEvalJobInput,
  type WorkspaceEvalJob,
  type WorkspaceEvalTrial,
} from '../core/rest/projects-client';
import { contract } from './query-contracts';
import { qk } from './query-keys';

const inventory = contract('inventory');

/** A job that has not ended re-reads every 5 seconds; an ended one does not. */
const OPEN_JOB_MS = 5_000;
const isOpen = (job: Pick<WorkspaceEvalJob, 'status'> | undefined) => job?.status === 'queued' || job?.status === 'running';

/** The suites of `evals:` in kortix.yaml, each with its latest job. Pass `null` while the `evals` flag is off. */
export function useWorkspaceEvalSuites(projectId: string | null | undefined) {
  return useQuery({
    queryKey: qk.project.evals(projectId ?? ''),
    queryFn: () => listWorkspaceEvalSuites(projectId as string),
    enabled: !!projectId,
    ...inventory,
  });
}

/** The tasks a suite selects, parsed at the default branch. */
export function useWorkspaceEvalTasks(projectId: string | null | undefined, suite: string | null | undefined) {
  return useQuery({
    queryKey: qk.project.evalTasks(projectId ?? '', suite ?? ''),
    queryFn: () => listWorkspaceEvalTasks(projectId as string, { suite: suite as string }),
    enabled: !!projectId && !!suite,
    ...inventory,
  });
}

/** The newest 100 jobs (of one suite, or all). Re-reads every 5 seconds while one of them runs. */
export function useWorkspaceEvalJobs(projectId: string | null | undefined, suite?: string | null) {
  return useQuery({
    queryKey: qk.project.evalJobs(projectId ?? '', suite ?? ''),
    queryFn: async () => (await listWorkspaceEvalJobs(projectId as string, { suite: suite ?? undefined, limit: 100 })).jobs,
    enabled: !!projectId,
    ...inventory,
    refetchInterval: (query) => ((query.state.data as WorkspaceEvalJob[] | undefined)?.some(isOpen) ? OPEN_JOB_MS : false),
  });
}

/** One job and its trials, read together. Re-reads every 5 seconds until the job ends. */
export function useWorkspaceEvalJob(projectId: string | null | undefined, jobId: string | null | undefined) {
  return useQuery({
    queryKey: qk.project.evalJob(projectId ?? '', jobId ?? ''),
    queryFn: async (): Promise<{ job: WorkspaceEvalJob; trials: WorkspaceEvalTrial[] }> => {
      const [job, trials] = await Promise.all([
        getWorkspaceEvalJob(projectId as string, jobId as string),
        listWorkspaceEvalTrials(projectId as string, jobId as string),
      ]);
      return { job, trials };
    },
    enabled: !!projectId && !!jobId,
    ...inventory,
    refetchInterval: (query) => (isOpen((query.state.data as { job: WorkspaceEvalJob } | undefined)?.job) ? OPEN_JOB_MS : false),
  });
}

/** One trial: its instruction and the files of its folder. */
export function useWorkspaceEvalTrial(projectId: string | null | undefined, jobId: string | null | undefined, trialId: string | null | undefined) {
  return useQuery({
    queryKey: qk.project.evalTrial(projectId ?? '', jobId ?? '', trialId ?? ''),
    queryFn: () => getWorkspaceEvalTrial(projectId as string, jobId as string, trialId as string),
    enabled: !!projectId && !!jobId && !!trialId,
    ...inventory,
  });
}

/** One file of a trial's folder, as text. */
export function useWorkspaceEvalTrialFile(projectId: string | null | undefined, jobId: string | null | undefined, trialId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: [...qk.project.evalTrial(projectId ?? '', jobId ?? '', trialId ?? ''), 'file', path ?? ''] as const,
    queryFn: () => readWorkspaceEvalTrialFile(projectId as string, jobId as string, trialId as string, path as string),
    enabled: !!projectId && !!jobId && !!trialId && !!path,
    ...inventory,
  });
}

/** Start, re-run, cancel and delete jobs. Each refreshes every eval read of the project. */
export function useWorkspaceEvalActions(projectId: string | null | undefined) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: qk.project.evals(projectId ?? '') });
  const pid = () => {
    if (!projectId) throw new Error('No workspace.');
    return projectId;
  };
  return {
    start: useMutation({ mutationFn: (input: StartWorkspaceEvalJobInput) => startWorkspaceEvalJob(pid(), input), onSuccess: refresh }),
    rerun: useMutation({ mutationFn: (input: { jobId: string } & RerunWorkspaceEvalJobInput) => rerunWorkspaceEvalJob(pid(), input.jobId, { scope: input.scope, trial_ids: input.trial_ids }), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: (jobId: string) => cancelWorkspaceEvalJob(pid(), jobId), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (jobId: string) => deleteWorkspaceEvalJob(pid(), jobId), onSuccess: refresh }),
  };
}
