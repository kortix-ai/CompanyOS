/**
 * The employee: `/v1/workspaces/:workspaceId/employee*` (flag `employee`).
 *
 *   GET  /employee          its identity and event counts
 *   POST /employee          make this workspace an employee: turns on the
 *                           `employee` and `email_channel` flags, writes the
 *                           identity, starts its own conversation (idempotent)
 *   GET  /employee/events   its event log, newest first
 *   POST /employee/events   a person or one of its sessions posts an event;
 *                           the dispatcher routes it like any other
 *
 * Design: .agents/skills/learnings/work/digital-employee/README.md.
 */
import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { recordEmployeeEvent, listEmployeeEvents } from '../../employee/events';
import '../../employee/dispatch';
import '../lib/employee-trigger-delivery';
import { getEmployeeIdentity } from '../../employee/identity';
import {
  createEmployee,
  employeeName,
  EmployeeInputError,
  eventCounts,
  serializeEvent,
  serializeIdentity,
  syncEmployeeEmail,
} from '../../employee/service';
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

/** The project with the `employee` flag on, or the Response that ends the request. */
async function loadEmployeeProject(c: C): Promise<{ loaded: Loaded } | Response> {
  const loaded = await loadProjectForUser(c, workspaceIdParam(c) ?? '', 'read');
  if (!loaded) return c.json({ error: 'Not found' }, 404);
  const gate = requireFeatureFlag(c, loaded.row.metadata, 'employee');
  if (gate) return gate;
  return { loaded };
}

export function registerEmployeeRoutes(): void {
  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/employee',
      tags: ['employee'],
      summary: 'Show the employee',
      description: 'Its identity (name, email, phone, browser, drive, its own conversation) and its event counts by dispatch status. Flag `employee`.',
      ...auth,
      request: { params },
      responses: { 200: json(AnyObject, 'The employee'), ...errors(403, 404) },
    }),
    handler(async (c) => {
      const scope = await loadEmployeeProject(c);
      if (scope instanceof Response) return scope;
      const projectId = scope.loaded.row.projectId;
      const identity = await getEmployeeIdentity(projectId);
      if (!identity) return c.json({ error: 'This workspace has no employee yet', code: 'employee_not_found' }, 404);
      const synced = await syncEmployeeEmail(identity);
      return c.json({ employee: serializeIdentity(synced, await eventCounts(projectId)) }, 200);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/employee',
      tags: ['employee'],
      summary: 'Make this workspace an employee',
      description:
        'Turns on the `employee` and `email_channel` flags, writes the employee identity and starts its own conversation. ' +
        'A second call returns the employee that exists. Needs `project.settings.write`; a session cannot call it. Body: `{ name, role? }`.',
      ...auth,
      request: { params },
      responses: { 201: json(AnyObject, 'The employee'), ...errors(400, 403, 404) },
    }),
    handler(async (c) => {
      const loaded = await loadProjectForUser(c, workspaceIdParam(c) ?? '', 'read');
      if (!loaded) return c.json({ error: 'Not found' }, 404);
      if (isProjectSessionPrincipal(c)) return c.json({ error: 'A person makes a workspace an employee', code: 'employee_requires_person' }, 403);
      await assertProjectCapability(c, loaded.userId, loaded.row.accountId, loaded.row.projectId, PROJECT_ACTIONS.PROJECT_SETTINGS_WRITE);
      const body = await readJsonObject(c);
      let name: string;
      try {
        name = employeeName(body.name);
      } catch (err) {
        if (err instanceof EmployeeInputError) return c.json({ error: err.message, code: err.code }, 400);
        throw err;
      }
      const role = typeof body.role === 'string' && body.role.trim() ? body.role.trim().slice(0, 80) : null;
      const projectId = loaded.row.projectId;
      await writeProjectFeatureFlag(projectId, 'employee', true);
      await writeProjectFeatureFlag(projectId, 'email_channel', true);
      const identity = await createEmployee(projectId, { name, role });
      return c.json({ employee: serializeIdentity(identity, await eventCounts(projectId)) }, 201);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/employee/events',
      tags: ['employee'],
      summary: "List the employee's events",
      description: 'Newest first. `before` (an event id) pages back; `subject` and `source` filter. A private event shows only its type. Flag `employee`.',
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
      const scope = await loadEmployeeProject(c);
      if (scope instanceof Response) return scope;
      const before = Number(c.req.query('before'));
      const limit = Number(c.req.query('limit'));
      const rows = await listEmployeeEvents(scope.loaded.row.projectId, {
        before: Number.isSafeInteger(before) && before > 0 ? before : undefined,
        limit: Number.isSafeInteger(limit) ? limit : undefined,
        subject: c.req.query('subject') || undefined,
        source: c.req.query('source') || undefined,
      });
      return c.json({ events: rows.map(serializeEvent), next_before: rows.at(-1)?.eventId ?? null }, 200);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/employee/events',
      tags: ['employee'],
      summary: 'Post an event to the employee',
      description:
        'Writes one event to the log and dispatches it. Body: `{ type, summary, subject?, external_id?, payload?, audience? }`. ' +
        'A person posts as `person`, a session as `session`. The same `external_id` twice writes one event. Flag `employee`.',
      ...auth,
      request: { params },
      responses: { 201: json(AnyObject, 'The event'), ...errors(400, 403, 404) },
    }),
    handler(async (c) => {
      const scope = await loadEmployeeProject(c);
      if (scope instanceof Response) return scope;
      const body = await readJsonObject(c);
      const session = isProjectSessionPrincipal(c) ? callerKortixSessionId(c) : null;
      const type = typeof body.type === 'string' ? body.type.trim() : '';
      const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
      if (!summary) return c.json({ error: 'summary is required', code: 'employee_invalid' }, 400);
      const externalId = typeof body.external_id === 'string' && body.external_id.trim()
        ? body.external_id.trim().slice(0, 200)
        : crypto.randomUUID();
      try {
        const recorded = await recordEmployeeEvent({
          projectId: scope.loaded.row.projectId,
          source: session ? 'session' : 'person',
          type,
          subject: typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim().slice(0, 200) : null,
          externalId,
          actor: session ? { kind: 'employee', id: session } : { kind: 'member', id: scope.loaded.userId },
          audience: typeof body.audience === 'string' ? body.audience : 'team',
          summary,
          payload: body.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : {},
        });
        return c.json({ event_id: recorded.eventId, inserted: recorded.inserted }, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/^employee event /.test(message)) return c.json({ error: message, code: 'employee_invalid' }, 400);
        throw err;
      }
    }),
  );
}
