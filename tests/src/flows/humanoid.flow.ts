/**
 * Humanoid — the workspace as one always-on AI with its own identity and one
 * event ledger (`/v1/workspaces/:workspaceId/humanoid*`, flag `humanoid`).
 * Spec: tests/spec/end-to-end.md § 12g Humanoid. Source of truth:
 * apps/api/src/projects/routes/humanoid.ts + apps/api/src/humanoid/.
 *
 * The local profile has no sandbox and no external email: the identity names
 * what failed in `last_error`, and these flows assert only the contract. The
 * dispatcher and the channel adapters are proved in
 * apps/api/src/__tests__/integration-humanoid-events.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { flow } from '../core/flow';
import { AgentPrincipalsWorld } from '../fixtures/agent-principals';

const R = {
  show: '/v1/workspaces/:workspaceId/humanoid',
  create: '/v1/workspaces/:workspaceId/humanoid',
  events: '/v1/workspaces/:workspaceId/humanoid/events',
  post: '/v1/workspaces/:workspaceId/humanoid/events',
} as const;
const MANIFEST = 'project:\n  name: ke2e-humanoid\ndefault_agent: kortix\nagents:\n  kortix:\n    kortix_permissions: all\n';

interface Humanoid {
  name: string;
  role: string | null;
  status: string;
  last_error: string | null;
  mind_session_id: string | null;
}

function expectError(r: { statusCode: number; json<T>(): T; text(): string }, status: number, code: string) {
  if (r.statusCode !== status) throw new Error(`expected ${status} ${code}, got ${r.statusCode}: ${r.text()}`);
  const body = r.json<{ error?: string; code?: string }>();
  if (body.error !== code && body.code !== code) throw new Error(`expected ${code}, got ${r.text()}`);
}

flow(
  'HUM-1',
  {
    domain: 'humanoid',
    requires: ['database'],
    timeoutMs: 240_000,
    routes: [`GET ${R.show}`, `POST ${R.create}`, `GET ${R.events}`, `POST ${R.post}`],
  },
  async (ctx) => {
    const team = await ctx.fixtures.team();
    const project = await team.project({ managedGit: true });
    const world = await AgentPrincipalsWorld.open(ctx, { accountId: team.id, projectId: project.id });
    await world.writeManifest(MANIFEST, 'ke2e: humanoid agent');
    const owner = ctx.client.as(ctx.P.OWNER);
    const params = { workspaceId: project.id };
    try {
      await ctx.step('an anonymous caller → 401 on GET /humanoid', async () => {
        (await ctx.client.as(ctx.P.ANON).get(R.show, { params })).status(401);
      });

      await ctx.step('the flag off → GET /humanoid and both event routes answer 403 feature_disabled', async () => {
        expectError(await owner.get(R.show, { params }), 403, 'feature_disabled');
        expectError(await owner.get(R.events, { params }), 403, 'feature_disabled');
        expectError(await owner.post(R.post, { type: 'person.task.assigned', summary: 'x' }, { params }), 403, 'feature_disabled');
      });

      await ctx.step('a blank name → 400 humanoid_invalid; a session credential → 403 humanoid_requires_person', async () => {
        expectError(await owner.post(R.create, { name: '   ' }, { params }), 400, 'humanoid_invalid');
        const session = await world.mintAgentSession({ agent: 'kortix', launcher: ctx.P.OWNER, skipGrantSync: true });
        expectError(await session.client.post(R.create, { name: 'Otto' }, { params }), 403, 'humanoid_requires_person');
      });

      let first!: Humanoid;
      await ctx.step('the owner creates the Humanoid → 201 with its name and role; the flag is on; a second create returns the same identity', async () => {
        const r = await owner.post(R.create, { name: 'Otto', role: 'operations lead' }, { params, timeoutMs: 120_000 });
        r.status(201);
        first = r.json<{ humanoid: Humanoid }>().humanoid;
        if (first.name !== 'Otto' || first.role !== 'operations lead') throw new Error(`unexpected identity ${r.text()}`);
        if (!['ready', 'failed'].includes(first.status)) throw new Error(`unexpected status ${first.status}`);
        const shown = await owner.get(R.show, { params });
        shown.status(200);
        if (shown.json<{ humanoid: Humanoid }>().humanoid.name !== 'Otto') throw new Error(`GET /humanoid: ${shown.text()}`);
        const again = await owner.post(R.create, { name: 'Someone Else' }, { params, timeoutMs: 120_000 });
        again.status(201);
        const second = again.json<{ humanoid: Humanoid }>().humanoid;
        if (second.name !== 'Otto') throw new Error(`a second create renamed the Humanoid: ${again.text()}`);
        if (first.mind_session_id && second.mind_session_id !== first.mind_session_id) {
          throw new Error(`a second create started another conversation: ${first.mind_session_id} → ${second.mind_session_id}`);
        }
      });

      const externalId = `ke2e-${randomUUID()}`;
      const subject = `task:${randomUUID().slice(0, 8)}`;
      let eventId = 0;
      await ctx.step('one external_id posted twice → the same event, inserted true then false', async () => {
        const body = { type: 'person.task.assigned', summary: 'Prepare the synthetic weekly report', subject, external_id: externalId };
        const a = await owner.post(R.post, body, { params });
        a.status(201);
        const b = await owner.post(R.post, body, { params });
        b.status(201);
        const [ra, rb] = [a.json<{ event_id: number; inserted: boolean }>(), b.json<{ event_id: number; inserted: boolean }>()];
        if (!ra.inserted || rb.inserted || ra.event_id !== rb.event_id) throw new Error(`dedup broke: ${a.text()} / ${b.text()}`);
        eventId = ra.event_id;
      });

      await ctx.step('a bad type → 400 humanoid_invalid; no summary → 400', async () => {
        expectError(await owner.post(R.post, { type: 'Not A Type', summary: 'x' }, { params }), 400, 'humanoid_invalid');
        expectError(await owner.post(R.post, { type: 'person.task.assigned' }, { params }), 400, 'humanoid_invalid');
      });

      await ctx.step('GET /humanoid/events lists the posted event; a short page has no next_before', async () => {
        const r = await owner.get(R.events, { params, query: { subject } });
        r.status(200);
        const page = r.json<{ events: Array<{ event_id: number; source: string; type: string; summary: string; subject: string }>; next_before: number | null }>();
        if (page.events.length !== 1) throw new Error(`expected 1 event for the subject, got ${page.events.length}`);
        const [e] = page.events;
        if (e!.event_id !== eventId || e!.source !== 'person' || e!.summary !== 'Prepare the synthetic weekly report') {
          throw new Error(`unexpected event ${JSON.stringify(e)}`);
        }
        if (page.next_before !== null) throw new Error(`a short page answered next_before ${page.next_before}`);
      });
    } finally {
      await world.close();
    }
  },
);
