/**
 * The tool call log: `GET /v1/workspaces/:workspaceId/tool-calls`.
 * Maps to spec §24 (CONN-CALLLOG-1).
 */
import { assert, check } from '../core/expect';
import { flow } from '../core/flow';

// CONN-CALLLOG-1 — real gateway calls write the call log columns; the list
// shows them to a manager, a member sees only their own calls, `surface`
// filters, pages chain through `X-Next-Cursor`, and no row carries the
// call's arguments or the upstream body. The upstream is runner-local, so
// the flow runs on the local target only.
flow(
  'CONN-CALLLOG-1',
  {
    domain: 'connectors',
    requires: ['database'],
    timeoutMs: 120_000,
    routes: ['GET /v1/workspaces/:workspaceId/tool-calls', 'POST /v1/connectors/projects/:projectId/call'],
  },
  async (ctx) => {
    if (ctx.env.target !== 'local') {
      await ctx.step('deployed targets cannot reach a runner-local upstream: skipped', async () => {});
      return;
    }
    const team = await ctx.fixtures.team();
    const p = await team.project();
    const member = await team.addMember('member');
    const { createServer } = await import('node:http');
    const { Client: PgClient } = await import('pg');
    const db = new PgClient({ connectionString: ctx.env.databaseUrl as string, ssl: false });
    const slug = `ke2e-calllog-${Date.now().toString(36)}`;
    // Values that must never appear in a list response.
    const ARG_MARKER = 'calllog-argument-marker-4411';
    const BODY_MARKER = 'calllog-upstream-body-marker-8820';

    const upstream = createServer((req, res) => {
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.url?.startsWith('/api/ok')) return json(200, { ok: true, echo: BODY_MARKER });
      if (req.url?.startsWith('/api/missing')) return json(404, { error: 'not found', record: BODY_MARKER });
      json(404, { message: 'no route' });
    });
    const port = await new Promise<number>((resolve) =>
      upstream.listen(0, '127.0.0.1', () => resolve((upstream.address() as { port: number }).port)),
    );
    const base = `http://127.0.0.1:${port}`;
    const owner = ctx.client.as(ctx.P.OWNER);
    const call = (action: string, surface: string) =>
      owner.post(
        '/v1/connectors/projects/:projectId/call',
        { connector: slug, action, args: { q: ARG_MARKER } },
        { params: { projectId: p.id }, headers: { 'x-kortix-surface': surface }, timeoutMs: 60_000 },
      );
    type Row = Record<string, unknown> & { execution_id: string; action_path: string; acting_user_id: string | null };
    const list = (principal: typeof ctx.P.OWNER, query: Record<string, string> = {}) =>
      ctx.client.as(principal).get('/v1/workspaces/:workspaceId/tool-calls', { params: { workspaceId: p.id }, query });

    try {
      await db.connect();
      await ctx.step('seed an OpenAPI connector with two read actions on a runner-local upstream', async () => {
        const row = await db.query<{ connector_id: string }>(
          `INSERT INTO kortix.connectors (account_id, project_id, slug, name, provider_type, config, status)
           VALUES ($1, $2, $3, $4, 'openapi', '{"auth":{"type":"none"}}'::jsonb, 'active') RETURNING connector_id`,
          [team.id, p.id, slug, slug],
        );
        const connectorId = row.rows[0]?.connector_id;
        check(!!connectorId, 'the connector insert returns an id', connectorId);
        await db.query(
          `INSERT INTO kortix.connector_connections (account_id, project_id, connector_id, owner_type, label, status, is_default, metadata)
           VALUES ($1, $2, $3, 'project', $4, 'active', true, $5::jsonb)`,
          [team.id, p.id, connectorId, slug, JSON.stringify({ provider: 'openapi', connector_slug: slug })],
        );
        for (const path of ['ok', 'missing']) {
          await db.query(
            `INSERT INTO kortix.connector_actions (connector_id, path, name, description, input_schema, risk, binding)
             VALUES ($1, $2, $3, $4, '{"type":"object","properties":{"q":{"type":"string","x-in":"query"}}}'::jsonb, 'read', $5::jsonb)`,
            [connectorId, path, path, path, JSON.stringify({ kind: 'openapi', method: 'GET', path: `/api/${path}`, server: base })],
          );
        }
      });

      await ctx.step('the owner makes three calls: ok from the CLI, an upstream 404 and an unknown action from the API', async () => {
        (await call('ok', 'cli')).status(200);
        const failed = await call('missing', 'api');
        check(failed.statusCode === 404, 'the upstream 404 passes through as 404', failed.statusCode, 404);
        const refused = await call('nope', 'api');
        check(refused.statusCode >= 400, 'an unknown action is refused', refused.statusCode);
      });

      await ctx.step('a call the member made is written to the log as theirs', async () => {
        await db.query(
          `INSERT INTO kortix.connector_calls (account_id, project_id, action_path, acting_user_id, status, risk, surface, phase, principal_kind)
           VALUES ($1, $2, $3, $4, 'ok', 'read', 'api', 'done', 'user')`,
          [team.id, p.id, `${slug}.ok`, member.userId],
        );
      });

      let ownerRows: Row[] = [];
      await ctx.step('the owner (a manager) lists all four calls with surface, phase and refusal reason, and no arguments or body', async () => {
        const r = await list(ctx.P.OWNER, { connector: slug });
        r.status(200);
        ownerRows = r.json<{ tool_calls: Row[] }>().tool_calls;
        const summary = ownerRows
          .map((row) => `${row.action_path}|${row.surface}|${row.status}|${row.phase}|${row.refusal_reason ?? '-'}`)
          .sort();
        const want = [
          `${slug}.missing|api|error|upstream|upstream_404`,
          `${slug}.nope|api|denied|grant|action_not_found`,
          `${slug}.ok|api|ok|done|-`,
          `${slug}.ok|cli|ok|done|-`,
        ];
        assert({ kind: 'api', description: 'the manager sees every call with its call log columns', expected: want, actual: summary, pass: JSON.stringify(summary) === JSON.stringify(want) });
        const text = r.text();
        const leaks = { arg: text.includes(ARG_MARKER), body: text.includes(BODY_MARKER), args_key: /"(args|result_summary|request_digest)"/.test(text) };
        assert({ kind: 'api', description: 'no row carries the arguments, the upstream body or the result summary', expected: { arg: false, body: false, args_key: false }, actual: leaks, pass: !leaks.arg && !leaks.body && !leaks.args_key });
        const real = ownerRows.find((row) => row.surface === 'cli')!;
        const timed = { kortix_ms: typeof real.kortix_ms, upstream_ms: typeof real.upstream_ms };
        assert({ kind: 'api', description: 'the real call carries its Kortix and upstream time', expected: { kortix_ms: 'number', upstream_ms: 'number' }, actual: timed, pass: timed.kortix_ms === 'number' && timed.upstream_ms === 'number' });
      });

      await ctx.step('a member sees only the call they made', async () => {
        const r = await list(member, { connector: slug });
        r.status(200);
        const rows = r.json<{ tool_calls: Row[] }>().tool_calls;
        const mine = rows.map((row) => row.acting_user_id);
        assert({ kind: 'api', description: 'the member lists exactly their own call', expected: [member.userId], actual: mine, pass: mine.length === 1 && mine[0] === member.userId });
      });

      await ctx.step('surface=cli lists only the CLI call', async () => {
        const r = await list(ctx.P.OWNER, { connector: slug, surface: 'cli' });
        r.status(200);
        const surfaces = r.json<{ tool_calls: Row[] }>().tool_calls.map((row) => row.surface);
        assert({ kind: 'api', description: 'the surface filter keeps only cli rows', expected: ['cli'], actual: surfaces, pass: surfaces.length === 1 && surfaces[0] === 'cli' });
        (await list(ctx.P.OWNER, { surface: 'nowhere' })).status(400);
      });

      await ctx.step('limit=3 pages through X-Next-Cursor without a repeat or a gap', async () => {
        const first = await list(ctx.P.OWNER, { connector: slug, limit: '3' });
        first.status(200);
        const cursor = first.header('x-next-cursor');
        check(!!cursor, 'a full first page sends X-Next-Cursor', cursor);
        const second = await list(ctx.P.OWNER, { connector: slug, limit: '3', cursor: cursor! });
        second.status(200);
        const ids = [...first.json<{ tool_calls: Row[] }>().tool_calls, ...second.json<{ tool_calls: Row[] }>().tool_calls].map((row) => row.execution_id);
        const all = ownerRows.map((row) => row.execution_id);
        assert({ kind: 'api', description: 'two pages hold the four calls once each, newest first', expected: all, actual: ids, pass: JSON.stringify(ids) === JSON.stringify(all) });
        check(!second.header('x-next-cursor'), 'the last page sends no X-Next-Cursor', second.header('x-next-cursor'));
        (await list(ctx.P.OWNER, { cursor: 'not-a-cursor' })).status(400);
      });
    } finally {
      upstream.close();
      await db.query('DELETE FROM kortix.connector_calls WHERE project_id = $1', [p.id]).catch(() => {});
      await db.query('DELETE FROM kortix.connectors WHERE project_id = $1 AND slug = $2', [p.id, slug]).catch(() => {});
      await db.end().catch(() => {});
    }
  },
);
