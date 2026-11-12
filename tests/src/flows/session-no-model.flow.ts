/**
 * SESS-64 — Session create refuses when no model can run the session.
 * Contract: tests/spec/end-to-end.md.
 */
import { flow } from '../core/flow';
import { fundDatabaseAccount } from '../fixtures/database-project';

const sessionsRoute = '/v1/workspaces/:projectId/sessions';

flow(
  'SESS-64',
  {
    domain: 'sessions',
    requires: ['database'],
    routes: ['POST /v1/workspaces/:projectId/sessions', 'GET /v1/workspaces/:projectId/sessions'],
  },
  async (ctx) => {
    const owner = ctx.client.as(ctx.P.OWNER);

    await ctx.step('a Free-plan workspace with credits and no provider key → 409 no_model_available, no session row', async () => {
      // The team fixture is the Free plan funded with credits: no managed model, no key.
      const team = await ctx.fixtures.team();
      const project = await team.project({ managedGit: true });
      const params = { projectId: project.id };
      const before = (await owner.get(sessionsRoute, { params })).status(200).json<any>();
      const created = await owner.post(sessionsRoute, { initial_prompt: 'hello' }, { params });
      created
        .status(409)
        .body()
        .has('$.code', 'no_model_available')
        .has('$.plan_upgrade', true)
        .has('$.error', 'No model: upgrade to the Credits plan or add your own provider key.');
      const after = (await owner.get(sessionsRoute, { params })).status(200).json<any>();
      const count = (list: any) => (Array.isArray(list) ? list : list?.sessions ?? []).length;
      if (count(after) !== count(before)) {
        throw new Error(`refused create left a session row: ${count(before)} → ${count(after)}`);
      }
    });

    await ctx.step('a Credits-plan workspace with no model named → 201 on the platform default (local: no managed model is served → 409 plan_upgrade:false)', async () => {
      const team = await ctx.fixtures.team({ credits: false });
      await fundDatabaseAccount(ctx.env, team.id);
      const project = await team.project({ managedGit: true });
      const created = await owner.post(sessionsRoute, { initial_prompt: 'hello' }, { params: { projectId: project.id } });
      if (ctx.env.target === 'local') {
        created
          .status(409)
          .body()
          .has('$.code', 'no_model_available')
          .has('$.plan_upgrade', false)
          .has('$.error', 'No model: add a provider key or turn on Kortix Managed Models in Models.');
        return;
      }
      created.status(201);
      const sessionId = created.json<any>().session_id;
      if (!sessionId) throw new Error('session create returned no session_id');
      ctx.track('session', sessionId, { projectId: project.id });
    });
  },
);
