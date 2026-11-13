/**
 * Evals — Harbor-format tasks scored per agent (`/v1/projects/:projectId/evals/*`,
 * flag `evals`). Spec: tests/spec/end-to-end.md § 12e Evals. Source of truth:
 * apps/api/src/projects/routes/evals.ts + apps/api/src/projects/evals/.
 *
 * The local profile runs no sandbox and no Drive storage. These flows cover
 * what runs without one: the flag gate, suites (inline and a Harbor job
 * config file), task parsing, validation, job planning (tasks × agents ×
 * attempts), cancel, re-run and delete. A trial worked by a real sandbox and
 * graded by tests/test.sh needs the `sandbox` capability and is not part of
 * these flows.
 */
import { flow } from '../core/flow';
import type { FlowContext } from '../core/types';
import { AgentPrincipalsWorld } from '../fixtures/agent-principals';

const R = {
  suites: '/v1/projects/:projectId/evals',
  tasks: '/v1/projects/:projectId/evals/tasks',
  jobs: '/v1/projects/:projectId/evals/jobs',
  job: '/v1/projects/:projectId/evals/jobs/:jobId',
  trials: '/v1/projects/:projectId/evals/jobs/:jobId/trials',
  cancel: '/v1/projects/:projectId/evals/jobs/:jobId/cancel',
  rerun: '/v1/projects/:projectId/evals/jobs/:jobId/rerun',
} as const;

const TASK_TOML = '[agent]\ntimeout_sec = 120.0\n\n[verifier]\ntimeout_sec = 30.0\nenvironment_mode = "shared"\n';
const task = (name: string, extra: Record<string, string> = {}) => ({
  [`evals/tasks/${name}/task.toml`]: TASK_TOML,
  [`evals/tasks/${name}/instruction.md`]: `<!-- canary -->\nCreate /var/tmp/${name}.txt.\n`,
  [`evals/tasks/${name}/tests/test.sh`]: `#!/bin/bash\n[ -f /var/tmp/${name}.txt ] && echo 1 > /logs/verifier/reward.txt || echo 0 > /logs/verifier/reward.txt\n`,
  [`evals/tasks/${name}/solution/solve.sh`]: `#!/bin/bash\ntouch /var/tmp/${name}.txt\n`,
  ...extra,
});
const MANIFEST = `project:
  name: ke2e-evals
default_agent: kortix
agents:
  kortix:
    kortix_permissions: all
evals:
  smoke:
    tasks: evals/tasks
    agents: [oracle, nop]
    n_attempts: 2
  harbor:
    config: evals/harbor.yaml
  broken:
    tasks: evals/missing
    agents: [kortix]
`;
const HARBOR_CONFIG = 'jobs_dir: jobs\nn_attempts: 1\nenvironment:\n  type: docker\nagents:\n  - name: kortix\ndatasets:\n  - path: evals/tasks\n';

interface Job {
  job_id: string;
  job_name: string;
  status: string;
  suite: string | null;
  commit: string | null;
  rerun_of: string | null;
  stats: { n_total_trials: number; n_queued: number; n_cancelled: number };
}

async function openWorld(ctx: FlowContext) {
  const team = await ctx.fixtures.team();
  const project = await team.project({ managedGit: true });
  const world = await AgentPrincipalsWorld.open(ctx, { accountId: team.id, projectId: project.id });
  await world.commitToMain(
    { 'kortix.yaml': MANIFEST, 'evals/harbor.yaml': HARBOR_CONFIG, ...task('alpha'), ...task('beta'), 'evals/tasks/not-a-task/README.md': 'no task.toml here\n' },
    'ke2e: eval tasks',
  );
  await world.setFeature('evals', true);
  return { project, world, owner: ctx.client.as(ctx.P.OWNER) };
}

function expectError(r: { statusCode: number; json<T>(): T; text(): string }, status: number, code: string) {
  if (r.statusCode !== status) throw new Error(`expected ${status} ${code}, got ${r.statusCode}: ${r.text()}`);
  const body = r.json<{ error?: string; code?: string }>();
  if (body.error !== code && body.code !== code) throw new Error(`expected ${code}, got ${r.text()}`);
}

flow(
  'EVAL-1',
  {
    domain: 'evals',
    requires: ['database'],
    timeoutMs: 240_000,
    routes: [
      `GET ${R.suites}`,
      `GET ${R.tasks}`,
      `GET ${R.jobs}`,
      `POST ${R.jobs}`,
      `GET ${R.job}`,
      `DELETE ${R.job}`,
      `GET ${R.trials}`,
      `POST ${R.cancel}`,
      `POST ${R.rerun}`,
      'PATCH /v1/projects/:projectId/features',
    ],
  },
  async (ctx) => {
    const { project, world, owner } = await openWorld(ctx);
    const params = { projectId: project.id };

    await ctx.step('an anonymous caller → 401; the flag off → 403 feature_disabled on read and start; on again → 200', async () => {
      (await ctx.client.as(ctx.P.ANON).get(R.suites, { params })).status(401);
      await world.setFeature('evals', false);
      expectError(await owner.get(R.suites, { params }), 403, 'feature_disabled');
      expectError(await owner.post(R.jobs, { suite: 'smoke' }, { params }), 403, 'feature_disabled');
      await world.setFeature('evals', true);
      (await owner.get(R.suites, { params })).status(200);
    });

    await ctx.step('suites: inline and Harbor config resolve, ignored Harbor fields warn, a missing path is the job’s error', async () => {
      const suites = (await owner.get(R.suites, { params })).status(200).json<{ suites: Array<{ name: string; source: string; config: { n_attempts: number; agents: Array<{ name: string }> } | null; error: string | null; warnings: string[] }> }>().suites;
      const byName = new Map(suites.map((s) => [s.name, s]));
      const smoke = byName.get('smoke');
      if (!smoke?.config || smoke.source !== 'inline' || smoke.config.n_attempts !== 2 || smoke.config.agents.map((a) => a.name).join() !== 'oracle,nop') throw new Error(JSON.stringify(smoke));
      const harbor = byName.get('harbor');
      if (!harbor?.config || harbor.source !== 'config' || harbor.config.agents[0]?.name !== 'kortix') throw new Error(JSON.stringify(harbor));
      if (!harbor.warnings.some((w) => w.includes('jobs_dir')) || !harbor.warnings.some((w) => w.includes('environment.type'))) throw new Error(`warnings ${JSON.stringify(harbor.warnings)}`);
      if (!byName.get('broken')?.config) throw new Error('broken suite should resolve its config; its path fails at job start');
    });

    await ctx.step('tasks of a suite: parsed from task.toml and instruction.md; a folder without task.toml is not listed', async () => {
      const body = (await owner.get(R.tasks, { params, query: { suite: 'smoke' } })).status(200).json<{ commit: string; tasks: Array<{ name: string; instruction: string; agent_timeout_sec: number; verifier_timeout_sec: number; has_solution: boolean; unsupported: string | null }> }>();
      if (body.tasks.map((t) => t.name).join() !== 'alpha,beta') throw new Error(JSON.stringify(body.tasks.map((t) => t.name)));
      const alpha = body.tasks[0]!;
      if (alpha.instruction !== 'Create /var/tmp/alpha.txt.' || alpha.agent_timeout_sec !== 120 || alpha.verifier_timeout_sec !== 30 || !alpha.has_solution || alpha.unsupported) throw new Error(JSON.stringify(alpha));
    });

    await ctx.step('invalid starts → 422 eval_invalid with violations and no job: unknown suite, unknown agent, a path with no task', async () => {
      const unknownSuite = await owner.post(R.jobs, { suite: 'nope' }, { params });
      expectError(unknownSuite, 422, 'eval_invalid');
      expectError(await owner.post(R.jobs, { suite: 'smoke', config: { agents: [{ name: 'ghost' }] } }, { params }), 422, 'eval_invalid');
      const missing = await owner.post(R.jobs, { suite: 'broken' }, { params });
      expectError(missing, 422, 'eval_invalid');
      if (!missing.json<{ violations?: string[] }>().violations?.some((v) => v.includes('evals/missing'))) throw new Error(missing.text());
      const jobs = (await owner.get(R.jobs, { params })).json<{ jobs: Job[] }>().jobs;
      if (jobs.length !== 0) throw new Error(`expected no job, got ${jobs.length}`);
    });

    let job: Job | null = null;
    await ctx.step('start smoke → 201 queued, 2 tasks × 2 agents × 2 attempts = 8 trials at the default branch commit', async () => {
      job = (await owner.post(R.jobs, { suite: 'smoke' }, { params })).status(201).json<{ job: Job }>().job;
      if (job.status !== 'queued' || job.suite !== 'smoke' || !/^[0-9a-f]{40}$/.test(job.commit ?? '') || job.stats.n_total_trials !== 8) throw new Error(JSON.stringify(job));
      const trials = (await owner.get(R.trials, { params: { ...params, jobId: job.job_id } })).status(200).json<{ trials: Array<{ trial_name: string; status: string }> }>().trials;
      const names = trials.map((t) => t.trial_name).sort();
      if (names.length !== 8 || names[0] !== 'alpha__nop__1' || names[7] !== 'beta__oracle__2' || trials.some((t) => t.status !== 'queued')) throw new Error(JSON.stringify(names));
    });

    await ctx.step('a config override layers over the suite: one agent, one attempt → 2 trials; the suite’s tasks stay', async () => {
      const small = (await owner.post(R.jobs, { suite: 'smoke', config: { agents: [{ name: 'oracle' }], n_attempts: 1, job_name: 'oracle-once' } }, { params })).status(201).json<{ job: Job }>().job;
      if (small.job_name !== 'oracle-once' || small.stats.n_total_trials !== 2) throw new Error(JSON.stringify(small));
      // The same name again gets a suffix, not a conflict.
      const again = (await owner.post(R.jobs, { suite: 'smoke', config: { agents: [{ name: 'oracle' }], n_attempts: 1, job_name: 'oracle-once' } }, { params })).status(201).json<{ job: Job }>().job;
      if (again.job_name !== 'oracle-once-2') throw new Error(again.job_name);
    });

    await ctx.step('delete of a queued job → 409 eval_conflict; cancel → cancelled, every trial cancelled', async () => {
      const jobId = job!.job_id;
      expectError(await owner.del(R.job, { params: { ...params, jobId } }), 409, 'eval_conflict');
      const cancelled = (await owner.post(R.cancel, {}, { params: { ...params, jobId } })).status(200).json<{ job: Job }>().job;
      if (cancelled.status !== 'cancelled' || cancelled.stats.n_cancelled !== 8 || cancelled.stats.n_queued !== 0) throw new Error(JSON.stringify(cancelled));
    });

    await ctx.step('re-run all → a new queued job at the same commit with rerun_of set and the same 8 trials', async () => {
      const next = (await owner.post(R.rerun, { scope: 'all' }, { params: { ...params, jobId: job!.job_id } })).status(201).json<{ job: Job }>().job;
      if (next.rerun_of !== job!.job_id || next.commit !== job!.commit || next.stats.n_total_trials !== 8 || next.status !== 'queued') throw new Error(JSON.stringify(next));
      (await owner.post(R.cancel, {}, { params: { ...params, jobId: next.job_id } })).status(200);
    });

    await ctx.step('delete an ended job → 200; it reads 404 eval_not_found after', async () => {
      const jobId = job!.job_id;
      (await owner.del(R.job, { params: { ...params, jobId } })).status(200);
      expectError(await owner.get(R.job, { params: { ...params, jobId } }), 404, 'eval_not_found');
    });
  },
);
