/**
 * The humanoid: `/v1/workspaces/:workspaceId/humanoid*` (flag `humanoid`).
 *
 *   GET  /humanoid          its identity and event counts
 *   POST /humanoid          make this workspace a humanoid: turns on the
 *                           `humanoid` and `email_channel` flags, writes the
 *                           identity, starts its own conversation (idempotent)
 *   GET  /humanoid/events   its event log, newest first
 *   POST /humanoid/events   a person or one of its sessions posts an event;
 *                           the dispatcher routes it like any other
 *
 * Design: .agents/skills/learnings/work/humanoid/README.md.
 */
import { createRoute, z } from '@hono/zod-openapi';
import { config } from '../../config';
import type { Context } from 'hono';
import { recordHumanoidEvent, listHumanoidEvents } from '../../humanoid/events';
import '../../humanoid/dispatch';
import '../lib/humanoid-trigger-delivery';
import { getHumanoidIdentity } from '../../humanoid/identity';
import {
  createHumanoid,
  humanoidName,
  HumanoidInputError,
  eventCounts,
  serializeEvent,
  serializeIdentity,
  syncHumanoidEmail,
} from '../../humanoid/service';
import { requireFeatureFlag } from '../../feature-flags/gate';
import { writeProjectFeatureFlag } from '../../feature-flags/write';
import { PROJECT_ACTIONS } from '../../iam';
import { isProjectSessionPrincipal } from '../../iam/agent-scope';
import { callerKortixSessionId } from '../../middleware/caller-session';
import { auth, errors, json } from '../../openapi';
import { readJsonObject } from '../../shared/http-body';
import { workspaceIdParam } from '../../shared/route-params';
import type { AppEnv } from '../../types';
import { assertProjectCapability, loadProjectForUser } from '../lib/access';
import { AnyObject, projectsApp } from '../lib/app';

type C = Context<AppEnv>;
const params = z.object({ workspaceId: z.string() });

function handler(fn: (c: C) => Promise<Response>): never {
  return fn as never;
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadProjectForUser>>>;

/** The project with the `humanoid` flag on, or the Response that ends the request. */
async function loadHumanoidProject(c: C): Promise<{ loaded: Loaded } | Response> {
  const loaded = await loadProjectForUser(c, workspaceIdParam(c) ?? '', 'read');
  if (!loaded) return c.json({ error: 'Not found' }, 404);
  const gate = requireFeatureFlag(c, loaded.row.metadata, 'humanoid');
  if (gate) return gate;
  return { loaded };
}

export function registerHumanoidRoutes(): void {
  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/humanoid',
      tags: ['humanoid'],
      summary: 'Show the humanoid',
      description: 'Its identity (name, email, phone, browser, drive, its own conversation) and its event counts by dispatch status. Flag `humanoid`.',
      ...auth,
      request: { params },
      responses: { 200: json(AnyObject, 'The humanoid'), ...errors(403, 404) },
    }),
    handler(async (c) => {
      const scope = await loadHumanoidProject(c);
      if (scope instanceof Response) return scope;
      const projectId = scope.loaded.row.projectId;
      const identity = await getHumanoidIdentity(projectId);
      if (!identity) return c.json({ error: 'This workspace has no humanoid yet', code: 'humanoid_not_found' }, 404);
      const synced = await syncHumanoidEmail(identity);
      return c.json({ humanoid: serializeIdentity(synced, await eventCounts(projectId)) }, 200);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/humanoid',
      tags: ['humanoid'],
      summary: 'Make this workspace a humanoid',
      description:
        'Turns on the `humanoid` and `email_channel` flags, writes the humanoid identity and starts its own conversation. ' +
        'A second call returns the humanoid that exists. Needs `project.settings.write`; a session cannot call it. Body: `{ name, role? }`.',
      ...auth,
      request: { params },
      responses: { 201: json(AnyObject, 'The humanoid'), ...errors(400, 403, 404) },
    }),
    handler(async (c) => {
      const loaded = await loadProjectForUser(c, workspaceIdParam(c) ?? '', 'read');
      if (!loaded) return c.json({ error: 'Not found' }, 404);
      if (isProjectSessionPrincipal(c)) return c.json({ error: 'A person makes a workspace a humanoid', code: 'humanoid_requires_person' }, 403);
      await assertProjectCapability(c, loaded.userId, loaded.row.accountId, loaded.row.projectId, PROJECT_ACTIONS.PROJECT_SETTINGS_WRITE);
      const body = await readJsonObject(c);
      let name: string;
      try {
        name = humanoidName(body.name);
      } catch (err) {
        if (err instanceof HumanoidInputError) return c.json({ error: err.message, code: err.code }, 400);
        throw err;
      }
      const role = typeof body.role === 'string' && body.role.trim() ? body.role.trim().slice(0, 80) : null;
      const projectId = loaded.row.projectId;
      await writeProjectFeatureFlag(projectId, 'humanoid', true);
      await writeProjectFeatureFlag(projectId, 'email_channel', true);
      const identity = await createHumanoid(projectId, {
        name,
        role,
        accountId: loaded.row.accountId,
        createdBy: loaded.userId,
        webhookBaseUrl: config.KORTIX_URL || new URL(c.req.url).origin,
      });
      return c.json({ humanoid: serializeIdentity(identity, await eventCounts(projectId)) }, 201);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/humanoid/events',
      tags: ['humanoid'],
      summary: "List the humanoid's events",
      description: 'Newest first. `before` (an event id) pages back; `subject` and `source` filter. A private event shows only its type. Flag `humanoid`.',
      ...auth,
      request: {
        params,
        query: z.object({
          before: z.string().optional(),
          limit: z.string().optional(),
          subject: z.string().optional(),
          source: z.string().optional(),
        }),
      },
      responses: { 200: json(AnyObject, 'The events'), ...errors(403, 404) },
    }),
    handler(async (c) => {
      const scope = await loadHumanoidProject(c);
      if (scope instanceof Response) return scope;
      const before = Number(c.req.query('before'));
      const limit = Number(c.req.query('limit'));
      const pageSize = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
      const rows = await listHumanoidEvents(scope.loaded.row.projectId, {
        before: Number.isSafeInteger(before) && before > 0 ? before : undefined,
        limit: pageSize,
        subject: c.req.query('subject') || undefined,
        source: c.req.query('source') || undefined,
      });
      // A full page may have older events behind it; a short page is the end.
      return c.json({ events: rows.map(serializeEvent), next_before: rows.length === pageSize ? rows.at(-1)!.eventId : null }, 200);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/humanoid/events',
      tags: ['humanoid'],
      summary: 'Post an event to the humanoid',
      description:
        'Writes one event to the log and dispatches it. Body: `{ type, summary, subject?, external_id?, payload?, audience? }`. ' +
        'A person posts as `person`, a session as `session`. The same `external_id` twice writes one event. Flag `humanoid`.',
      ...auth,
      request: { params },
      responses: { 201: json(AnyObject, 'The event'), ...errors(400, 403, 404) },
    }),
    handler(async (c) => {
      const scope = await loadHumanoidProject(c);
      if (scope instanceof Response) return scope;
      const body = await readJsonObject(c);
      const session = isProjectSessionPrincipal(c) ? callerKortixSessionId(c) : null;
      const type = typeof body.type === 'string' ? body.type.trim() : '';
      const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
      if (!summary) return c.json({ error: 'summary is required', code: 'humanoid_invalid' }, 400);
      const externalId = typeof body.external_id === 'string' && body.external_id.trim()
        ? body.external_id.trim().slice(0, 200)
        : crypto.randomUUID();
      try {
        const recorded = await recordHumanoidEvent({
          projectId: scope.loaded.row.projectId,
          source: session ? 'session' : 'person',
          type,
          subject: typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim().slice(0, 200) : null,
          externalId,
          actor: session ? { kind: 'humanoid', id: session } : { kind: 'member', id: scope.loaded.userId },
          audience: typeof body.audience === 'string' ? body.audience : 'team',
          summary,
          payload: body.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : {},
        });
        return c.json({ event_id: recorded.eventId, inserted: recorded.inserted }, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/^humanoid event /.test(message)) return c.json({ error: message, code: 'humanoid_invalid' }, 400);
        throw err;
      }
    }),
  );
}
