/**
 * Evals: `/v1/workspaces/:workspaceId/evals/*`, legacy `/v1/projects/:workspaceId/evals/*` (project flag `evals`).
 *
 * Reads need project read access. Starting, cancelling and re-running a job
 * starts or stops sessions, so they need `project.session.start`. Deleting a
 * job needs project write access. The rules are in `projects/evals/service.ts`.
 *
 * Wire contract: @kortix/api-contract evals.ts. Errors: `404 eval_not_found`,
 * `409 eval_conflict`, `422 eval_invalid` (with `violations`), `503
 * eval_unavailable` (no Files storage). Flag off: `403 feature_disabled`.
 */
import { createRoute, z } from '@hono/zod-openapi';
import {
  CreateEvalJobRequestSchema,
  EvalErrorSchema,
  EvalJobListResponseSchema,
  EvalJobResponseSchema,
  EvalSuitesResponseSchema,
  EvalTaskDetailResponseSchema,
  EvalTaskResultSchema,
  EvalTasksResponseSchema,
  EvalTrialDetailResponseSchema,
  EvalTrialListResponseSchema,
  RerunEvalJobRequestSchema,
} from '@kortix/api-contract';
import type { Context } from 'hono';
import { driveStorageAvailable } from '../../drives/volumes';
import { requireFeatureFlag } from '../../feature-flags/gate';
import { PROJECT_ACTIONS } from '../../iam';
import { auth, errors, json, lenientBody } from '../../openapi';
import { workspaceIdParam } from '../../shared/route-params';
import { isUuid } from '../../shared/validate';
import type { AppEnv } from '../../types';
import { EvalConfigError } from '../evals/config';
import { serializeJob, serializeTrial } from '../evals/serialize';
import * as evals from '../evals/service';
import { readEvalFile, trialFolder } from '../evals/storage';
import { getJob, getTrial, listJobs, listTrials } from '../evals/store';
import { listRegistryDatasets } from '../evals/task-source';
import { assertProjectCapability, loadProjectForUser } from '../lib/access';
import { projectsApp } from '../lib/app';

type EvalContextC = Context<AppEnv>;
const projectParams = z.object({ workspaceId: z.string() });
const jobParams = projectParams.extend({ jobId: z.string() });
const trialParams = jobParams.extend({ trialId: z.string() });
const EVAL_ERRORS = {
  403: json(EvalErrorSchema, 'feature_disabled'),
  404: json(EvalErrorSchema, 'eval_not_found'),
  409: json(EvalErrorSchema, 'eval_conflict'),
  422: json(EvalErrorSchema, 'eval_invalid, with violations'),
};

type Loaded = NonNullable<Awaited<ReturnType<typeof loadProjectForUser>>>;

const notFound = (c: EvalContextC) => c.json({ error: 'eval_not_found' as const, message: 'Not found.' }, 404);

/** The project and the flag. `write`: the caller must be able to start sessions (or, for `admin`, write the project). */
async function scopeOf(c: EvalContextC, need: 'read' | 'run' | 'admin' = 'read'): Promise<Loaded | Response> {
  const loaded = await loadProjectForUser(c, workspaceIdParam(c) ?? '', need === 'admin' ? 'write' : 'read');
  if (!loaded) return notFound(c);
  const gate = requireFeatureFlag(c, loaded.row.metadata, 'evals');
  if (gate) return gate;
  if (need === 'run') {
    await assertProjectCapability(c, loaded.userId, loaded.row.accountId, loaded.row.projectId, PROJECT_ACTIONS.PROJECT_SESSION_START);
  }
  return loaded;
}

/** A service error as its response. Anything else is a server error and propagates. */
function errorResponse(c: EvalContextC, error: unknown): Response {
  if (error instanceof EvalConfigError) return c.json({ error: 'eval_invalid' as const, message: error.message, violations: error.violations }, 422);
  if (error instanceof evals.EvalNotFoundError) return notFound(c);
  if (error instanceof evals.EvalConflictError) return c.json({ error: 'eval_conflict' as const, message: error.message }, 409);
  throw error;
}

async function parseBody<T>(c: EvalContextC, schema: z.ZodType<T>): Promise<T | Response> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (parsed.success) return parsed.data;
  return c.json(
    { error: 'eval_invalid' as const, message: 'The request body is invalid.', violations: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`) },
    422,
  );
}

/** The route's typed-response check cannot follow a shared helper's Response, so it is skipped here. */
function handler(fn: (c: EvalContextC) => Promise<Response>): never {
  return fn as never;
}

async function jobOf(c: EvalContextC, loaded: Loaded) {
  const jobId = c.req.param('jobId') ?? '';
  return isUuid(jobId) ? getJob(loaded.row.projectId, jobId) : null;
}

export function registerEvalRoutes(): void {
  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals',
      tags: ['evals'],
      summary: 'List the eval suites of a project',
      description: 'The suites of `evals:` in kortix.yaml at `ref` (default: the default branch), each resolved to its job config, with its latest job. A suite that does not resolve carries `error`. Flag `evals`.',
      ...auth,
      request: { params: projectParams, query: z.object({ ref: z.string().optional() }) },
      responses: { 200: json(EvalSuitesResponseSchema, 'The suites'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      try {
        return c.json({ suites: await evals.listSuites(loaded.row, c.req.query('ref')) }, 200);
      } catch (error) {
        return errorResponse(c, error);
      }
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/tasks',
      tags: ['evals'],
      summary: 'List the tasks of a suite, a path or a dataset',
      description: 'The Harbor-format tasks a suite selects (`suite`), the tasks under a repository path (`path`), or the tasks of a dataset by name (`dataset`, `version`: built-in `kortix/…` or the Harbor registry), parsed at `ref`, with the dataset README. A task Kortix cannot run carries `unsupported`. Flag `evals`.',
      ...auth,
      request: { params: projectParams, query: z.object({ suite: z.string().optional(), path: z.string().optional(), dataset: z.string().optional(), version: z.string().optional(), ref: z.string().optional() }) },
      responses: { 200: json(EvalTasksResponseSchema, 'The tasks'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      const suite = c.req.query('suite');
      const path = c.req.query('path');
      const dataset = c.req.query('dataset');
      if (!suite && !path && !dataset) return c.json({ error: 'eval_invalid' as const, message: 'Pass `suite`, `path` or `dataset`.' }, 422);
      try {
        return c.json(await evals.listTasks(loaded.row, { suite, path, dataset, version: c.req.query('version'), ref: c.req.query('ref') }), 200);
      } catch (error) {
        return errorResponse(c, error);
      }
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/datasets',
      tags: ['evals'],
      summary: 'List the datasets of the Harbor registry',
      description: 'The datasets a suite can name under `datasets: [{ name, version }]`, such as `terminal-bench` `2.0`. Flag `evals`.',
      ...auth,
      request: { params: projectParams },
      responses: {
        200: json(z.object({ datasets: z.array(z.object({ name: z.string(), version: z.string(), description: z.string(), n_tasks: z.number() })) }), 'The datasets'),
        ...errors(400),
        ...EVAL_ERRORS,
      },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      return c.json({ datasets: await listRegistryDatasets() }, 200);
    }),
  );

  const taskParams = projectParams.extend({ taskId: z.string() });
  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/tasks/{taskId}',
      tags: ['evals'],
      summary: 'Get one task',
      description: 'A task by its `task_id`: the parsed task, its README, task.toml and every file of its folder. Flag `evals`.',
      ...auth,
      request: { params: taskParams },
      responses: { 200: json(EvalTaskDetailResponseSchema, 'The task'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      try {
        return c.json(await evals.taskDetail(loaded.row, c.req.param('taskId') ?? ''), 200);
      } catch (error) {
        return errorResponse(c, error);
      }
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/tasks/{taskId}/file',
      tags: ['evals'],
      summary: 'Read one file of a task',
      description: 'The text of a file the task detail lists, by its `path` (the first 1 MB). Flag `evals`.',
      ...auth,
      request: { params: taskParams, query: z.object({ path: z.string() }) },
      responses: { 200: { description: 'The file' }, ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      try {
        const text = await evals.taskFile(loaded.row, c.req.param('taskId') ?? '', c.req.query('path') ?? '');
        return new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, max-age=300' } });
      } catch (error) {
        return errorResponse(c, error);
      }
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/results',
      tags: ['evals'],
      summary: 'Results of one task across jobs',
      description: 'The newest trials (up to 100) of the task named `task` in this project’s jobs, each with its job, agent, model, rewards and error. Flag `evals`.',
      ...auth,
      request: { params: projectParams, query: z.object({ task: z.string() }) },
      responses: { 200: json(z.object({ results: z.array(EvalTaskResultSchema) }), 'The results'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      const task = c.req.query('task');
      if (!task) return c.json({ error: 'eval_invalid' as const, message: 'Pass `task`.' }, 422);
      return c.json({ results: await evals.taskResults(loaded.row, task) }, 200);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/jobs',
      tags: ['evals'],
      summary: 'List eval jobs',
      description: 'The jobs of a project, newest first, each with its stats. `suite` keeps one suite. `cursor` is `next_cursor` of the page before. Flag `evals`.',
      ...auth,
      request: { params: projectParams, query: z.object({ suite: z.string().optional(), limit: z.string().optional(), cursor: z.string().optional() }) },
      responses: { 200: json(EvalJobListResponseSchema, 'The jobs'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      const limit = Math.min(200, Math.max(1, Number(c.req.query('limit')) || 50));
      const cursor = c.req.query('cursor');
      const before = cursor && !Number.isNaN(Date.parse(cursor)) ? new Date(cursor) : undefined;
      const rows = await listJobs(loaded.row.projectId, { suite: c.req.query('suite'), limit: limit + 1, before });
      const page = rows.slice(0, limit);
      return c.json({ jobs: page.map(serializeJob), next_cursor: rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null }, 200);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/evals/jobs',
      tags: ['evals'],
      summary: 'Start an eval job',
      description:
        'Plans tasks × agents × attempts at `ref` and queues one trial for each. `suite` names a suite of `evals:`; `config` overrides its fields, or is the whole job config when no suite is named. ' +
        'Each trial runs in its own session and sandbox: the agent gets the task\'s instruction, then `tests/test.sh` runs and writes the reward. Needs `project.session.start`. Flag `evals`.',
      ...auth,
      request: { params: projectParams, body: { content: { 'application/json': { schema: lenientBody(CreateEvalJobRequestSchema.shape) } } } },
      responses: { 201: json(EvalJobResponseSchema, 'The job'), 503: json(EvalErrorSchema, 'eval_unavailable'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c, 'run');
      if (loaded instanceof Response) return loaded;
      if (!driveStorageAvailable()) return c.json({ error: 'eval_unavailable' as const, message: 'Evals keep their results in Files, and this deployment has no Files storage.' }, 503);
      const body = await parseBody(c, CreateEvalJobRequestSchema);
      if (body instanceof Response) return body;
      if (!body.suite && !body.config) return c.json({ error: 'eval_invalid' as const, message: 'Pass `suite`, `config`, or both.' }, 422);
      try {
        return c.json({ job: serializeJob(await evals.createJob(loaded.row, loaded.userId, body)) }, 201);
      } catch (error) {
        return errorResponse(c, error);
      }
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/jobs/{jobId}',
      tags: ['evals'],
      summary: 'Get an eval job',
      description: 'The job with its config and its stats: counts per trial status, and per agent and model the metrics over the valid rewards. Flag `evals`.',
      ...auth,
      request: { params: jobParams },
      responses: { 200: json(EvalJobResponseSchema, 'The job'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      const job = await jobOf(c, loaded);
      return job ? c.json({ job: serializeJob(job) }, 200) : notFound(c);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/jobs/{jobId}/trials',
      tags: ['evals'],
      summary: 'List the trials of an eval job',
      description: 'Every trial of the job, by task, agent and attempt. A retry of an attempt is its own trial with `retry` above 0. Flag `evals`.',
      ...auth,
      request: { params: jobParams },
      responses: { 200: json(EvalTrialListResponseSchema, 'The trials'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      const job = await jobOf(c, loaded);
      if (!job) return notFound(c);
      return c.json({ trials: (await listTrials(job.jobId)).map((trial) => serializeTrial(job, trial)) }, 200);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/jobs/{jobId}/trials/{trialId}',
      tags: ['evals'],
      summary: 'Get one trial',
      description: 'The trial, the instruction its agent got, and the files of its folder (`result.json`, `verifier/test-stdout.txt`, …). Flag `evals`.',
      ...auth,
      request: { params: trialParams },
      responses: { 200: json(EvalTrialDetailResponseSchema, 'The trial'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      try {
        return c.json(await evals.trialDetail(loaded.row, c.req.param('jobId') ?? '', c.req.param('trialId') ?? ''), 200);
      } catch (error) {
        return errorResponse(c, error);
      }
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/evals/jobs/{jobId}/trials/{trialId}/file',
      tags: ['evals'],
      summary: 'Read one file of a trial folder',
      description: 'The bytes of a file the trial detail lists, by its `path`. Flag `evals`.',
      ...auth,
      request: { params: trialParams, query: z.object({ path: z.string() }) },
      responses: { 200: { description: 'The file' }, ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c);
      if (loaded instanceof Response) return loaded;
      const job = await jobOf(c, loaded);
      const trial = job ? await getTrial(job.jobId, c.req.param('trialId') ?? '') : null;
      const path = c.req.query('path') ?? '';
      if (!job || !trial || !path || path.startsWith('/') || path.split('/').includes('..')) return notFound(c);
      const file = await readEvalFile(job.driveId, `${trialFolder(job.folder, trial.trialName)}/${path}`);
      if (!file || !file.ok) return notFound(c);
      return new Response(file.body, { status: 200, headers: { 'Content-Type': path.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'private, max-age=60' } });
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/evals/jobs/{jobId}/cancel',
      tags: ['evals'],
      summary: 'Cancel an eval job',
      description: 'No queued trial starts, and every running trial ends `cancelled` with its sandbox stopped. A job that ended stays as it is. Needs `project.session.start`. Flag `evals`.',
      ...auth,
      request: { params: jobParams },
      responses: { 200: json(EvalJobResponseSchema, 'The job'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c, 'run');
      if (loaded instanceof Response) return loaded;
      try {
        return c.json({ job: serializeJob(await evals.cancelJob(loaded.row, c.req.param('jobId') ?? '')) }, 200);
      } catch (error) {
        return errorResponse(c, error);
      }
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/evals/jobs/{jobId}/rerun',
      tags: ['evals'],
      summary: 'Run trials of a job again',
      description: 'Starts a new job at the same commit and config with the trials `scope` selects (`all`, `failed`: reward below 1 or none, `errored`: ended with an exception) or the named `trial_ids`. `rerun_of` of the new job names this one. Needs `project.session.start`. Flag `evals`.',
      ...auth,
      request: { params: jobParams, body: { content: { 'application/json': { schema: lenientBody(RerunEvalJobRequestSchema.shape) } } } },
      responses: { 201: json(EvalJobResponseSchema, 'The new job'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c, 'run');
      if (loaded instanceof Response) return loaded;
      const body = await parseBody(c, RerunEvalJobRequestSchema);
      if (body instanceof Response) return body;
      try {
        return c.json({ job: serializeJob(await evals.rerunJob(loaded.row, loaded.userId, c.req.param('jobId') ?? '', body)) }, 201);
      } catch (error) {
        return errorResponse(c, error);
      }
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'delete',
      path: '/{workspaceId}/evals/jobs/{jobId}',
      tags: ['evals'],
      summary: 'Delete an eval job',
      description: 'Deletes an ended job: its trials and its folder in Files. The sessions its trials ran in stay. A running job answers `409 eval_conflict`: cancel it first. Needs project write access. Flag `evals`.',
      ...auth,
      request: { params: jobParams },
      responses: { 200: json(z.object({ ok: z.literal(true) }), 'Deleted'), ...errors(400), ...EVAL_ERRORS },
    }),
    handler(async (c) => {
      const loaded = await scopeOf(c, 'admin');
      if (loaded instanceof Response) return loaded;
      try {
        await evals.removeJob(loaded.row, c.req.param('jobId') ?? '');
        return c.json({ ok: true as const }, 200);
      } catch (error) {
        return errorResponse(c, error);
      }
    }),
  );
}
