// GET /v1/workspaces/:workspaceId/tool-calls — the tool call log: every
// connector call of the workspace, newest first, from every surface. The rows
// a caller sees and why: lib/tool-call-log.ts.
import { createRoute, z } from '@hono/zod-openapi';
import { CALL_SURFACES, ToolCallLogPageSchema } from '@kortix/api-contract/tool-calls';
import { callerKortixSessionId } from '../../middleware/caller-session';
import { auth, errors, json } from '../../openapi';
import { workspaceIdParam } from '../../shared/route-params';
import { loadProjectForUser } from '../lib/access';
import { projectsApp } from '../lib/app';
import {
  TOOL_CALL_PAGE_DEFAULT,
  TOOL_CALL_PAGE_MAX,
  TOOL_CALL_STATUSES,
  decodeToolCallCursor,
  listToolCalls,
} from '../lib/tool-call-log';

const ToolCallQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(TOOL_CALL_PAGE_MAX).optional(),
  /** `X-Next-Cursor` of the previous page. */
  cursor: z.string().max(256).optional(),
  /** The agent slug the call ran as. */
  agent: z.string().min(1).max(128).optional(),
  /** A connector slug. */
  connector: z.string().min(1).max(128).optional(),
  surface: z.enum(CALL_SURFACES).optional(),
  status: z.enum(TOOL_CALL_STATUSES).optional(),
  refusal_reason: z.string().min(1).max(64).optional(),
  session_id: z.string().uuid().optional(),
  since: z.string().datetime({ offset: true }).optional(),
  until: z.string().datetime({ offset: true }).optional(),
});

export function registerToolCallRoutes(): void {
  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/tool-calls',
      tags: ['connectors'],
      summary: 'List the tool calls of a workspace',
      description:
        'Every connector call of the workspace, newest first: who made it (person, agent, credential), from which surface, ' +
        'its status, the step it stopped at, the refusal reason and the Kortix and upstream time. Never the arguments or the result. ' +
        'A manager sees every call except those of private channel threads they are not in. A member sees the calls they made ' +
        'and the calls of sessions they can open. An agent token sees its own session only. ' +
        'Keyset pages: pass `X-Next-Cursor` (also `next_cursor`) as `cursor`.',
      ...auth,
      request: {
        params: z.object({ workspaceId: z.string() }),
        query: ToolCallQuerySchema,
      },
      responses: {
        200: json(ToolCallLogPageSchema, 'One page of the tool call log'),
        ...errors(400, 404),
      },
    }),
    async (c) => {
      const projectId = workspaceIdParam(c);
      const query = c.req.valid('query');
      if (query.cursor && !decodeToolCallCursor(query.cursor)) {
        return c.json({ error: 'cursor is not a cursor this list issued', code: 'INVALID_CURSOR' }, 400);
      }
      const loaded = await loadProjectForUser(c, projectId, 'read');
      if (!loaded) return c.json({ error: 'Not found' }, 404);
      const page = await listToolCalls({
        loaded,
        boundSessionId: callerKortixSessionId(c),
        limit: query.limit ?? TOOL_CALL_PAGE_DEFAULT,
        cursor: query.cursor ?? null,
        filter: {
          agent: query.agent ?? null,
          connector: query.connector ?? null,
          surface: query.surface ?? null,
          status: query.status ?? null,
          refusalReason: query.refusal_reason ?? null,
          sessionId: query.session_id ?? null,
          since: query.since ? new Date(query.since) : null,
          until: query.until ? new Date(query.until) : null,
        },
      });
      const headers: Record<string, string> = { 'Access-Control-Expose-Headers': 'X-Next-Cursor' };
      if (page.nextCursor) headers['X-Next-Cursor'] = page.nextCursor;
      return c.json({ tool_calls: page.rows, next_cursor: page.nextCursor }, 200, headers);
    },
  );
}
