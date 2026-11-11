/**
 * The hosted Kortix MCP server: `POST /v1/mcp`, MCP Streamable HTTP (JSON
 * responses, stateless). One server per person, like the `kortix` CLI: it is
 * bound to the caller's token, never to a project, and reaches every account,
 * project and session that token can.
 *
 * Any MCP client adds the URL and signs in with OAuth ("Sign in with Kortix",
 * ../oauth): a `401` carries `WWW-Authenticate: Bearer resource_metadata=…`,
 * the client reads the RFC 9728 document, registers itself (RFC 7591), runs
 * the PKCE code flow, and returns with a `kortix_oat_` token that acts as the
 * user. A `kortix_pat_` (the CLI's token) works as a Bearer header too. Every
 * tool call runs through the real API routes in-process with that token, so
 * authorization is exactly the API's.
 */
import { Hono, type Context, type Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { CALL_SURFACE_HEADER } from '@kortix/api-contract/tool-calls';
import { supabaseAuth } from '../middleware/auth';
import { mcpResourceMetadataUrl, oauthIssuer } from '../oauth/discovery';
import { OAUTH_SCOPE_KORTIX } from '../oauth/access-token';
import { isUuid } from '../shared/validate';
import { databaseErrorSummary, isDatabaseError } from '../shared/database-errors';
import { logger } from '../lib/logger';
import { RELEASE_VERSION } from '../config';
import { bearerToken } from '../shared/bearer-token';
import {
  REQUEST_BUDGET_MS,
  runTool,
  SUPPORTED_PROTOCOL_VERSIONS,
  text,
  ToolInputError,
  type Dispatch,
  type ToolContext,
} from './runtime';
import { isVerb, runVerb, VERB_TOOLS } from './verbs';

export * from './runtime';

function instructions(): string {
  return [
    'Kortix MCP. You act as the signed-in user, with their permissions, across every account and project they can open.',
    'Six tools reach everything: `search` finds a tool by intent, `describe` reads its schema, `call` runs it, `execute` runs a JavaScript program that calls tools (loops, joins, filtering big results before you read them), `resume` reads a call that waits for a person, and `skills` reads the Kortix guides (`skills` name=kortix-system is the full reference).',
    'Tool ids: connectors.<slug>.<action> (a project connector such as Gmail, Slack, GitHub, an MCP server or an API), kortix.<METHOD> <path> (any Kortix API route), sessions.* (start, follow and message agent sessions), sandbox.* (bash and files in a session sandbox), projects.* and connector_admin.* (connect, add and remove connectors).',
    'Pass project_id, or add ?project=<id> to the MCP URL. projects.list shows the projects.',
    'Approvals: a connector write can return pending_approval with an approval_url. Give the person that link and stop; never repeat the call. `resume` with the execution_id reads the outcome. You can never approve a call yourself.',
    'Never ask a person for a password, token or API key in chat. connector_admin.connect returns a link the person opens to connect an account.',
  ].join('\n');
}

// ─── JSON-RPC ───────────────────────────────────────────────────────────────

async function handleRpc(ctx: ToolContext, method: string, params: Record<string, any>, scope: McpScope): Promise<unknown> {
  switch (method) {
    case 'initialize': {
      const requested = String(params.protocolVersion ?? '');
      return {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0]!,
        serverInfo: { name: 'kortix', title: 'Kortix CompanyOS', version: RELEASE_VERSION },
        capabilities: { tools: {} },
        instructions: instructions(),
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      // A fixed list, whatever the catalog holds. The older per-feature tools
      // still run when a client calls them by name (one release), unlisted.
      return { tools: VERB_TOOLS };
    case 'tools/call': {
      if (typeof params.name !== 'string') throw Object.assign(new Error('Invalid params: name must be a tool name'), { rpcCode: -32602 });
      const args = (params.arguments as Record<string, unknown>) ?? {};
      try {
        if (isVerb(params.name)) return await runVerb(ctx, params.name, args, { projectId: scope.projectId, surface: 'mcp' });
        return await runTool(ctx, params.name, args);
      } catch (err) {
        if (err instanceof ToolInputError) return text(err.message, true);
        throw err;
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${method}`), { rpcCode: -32601 });
  }
}

/**
 * Turns the auth middleware's 401 into the challenge MCP clients follow to find
 * the authorization server (RFC 9728 §5.1). URLs come from KORTIX_URL, never
 * from the request (learnings 2026-08-19).
 */
function challengeUnauthorized(c: Context, next: Next) {
  const metadata = `resource_metadata="${mcpResourceMetadataUrl(new URL(c.req.url).origin)}"`;
  const sent = bearerToken(c.req.header('Authorization')) !== null;
  // RFC 6750 3.1: a token that was sent and refused names `invalid_token`.
  const challenge = () =>
    c.json({ error: 'unauthorized', error_description: 'Sign in with OAuth, or send a kortix_pat_ token, to use the Kortix MCP server.' }, 401, {
      'WWW-Authenticate': `Bearer ${sent ? 'error="invalid_token", ' : ''}${metadata}, scope="${OAUTH_SCOPE_KORTIX}"`,
    });
  if (!sent) return challenge();
  return supabaseAuth(c, next).catch((err) => {
    if (err instanceof HTTPException && err.status === 401) return challenge();
    // A token without the `kortix` scope: tell the client which scope to ask for.
    if (err instanceof HTTPException && err.status === 403 && err.message.startsWith('insufficient_scope')) {
      return c.json({ error: 'insufficient_scope', error_description: err.message }, 403, {
        'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${OAUTH_SCOPE_KORTIX}", ${metadata}`,
      });
    }
    throw err;
  });
}

const PARSE_ERROR = Symbol('parse error');

/** What the MCP URL fixes for every call: `/v1/mcp?project=<id>` sets the default project. */
export interface McpScope {
  projectId: string | null;
}

export function mcpScopeOf(url: string): McpScope {
  const project = new URL(url).searchParams.get('project');
  return { projectId: project && isUuid(project) ? project : null };
}

export function createMcpApp(dispatch: Dispatch) {
  const app = new Hono();

  app.post('/', challengeUnauthorized, async (c) => {
    const reject = (id: unknown, code: number, message: string) => c.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, 400);
    const message = await c.req.json().catch(() => PARSE_ERROR);
    if (message === PARSE_ERROR) return reject(null, -32700, 'Parse error');
    if (Array.isArray(message)) return reject(null, -32600, 'Invalid Request: batches are not supported; send one message per request');
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return reject(null, -32600, 'Invalid Request: jsonrpc must be "2.0"');
    // A response from the client (the server sends no requests): accepted, nothing to answer.
    if (typeof message.method !== 'string') {
      return 'result' in message || 'error' in message ? c.body(null, 202) : reject(message.id, -32600, 'Invalid Request: method is required');
    }
    const version = c.req.header('MCP-Protocol-Version');
    if (version !== undefined && message.method !== 'initialize' && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
      return reject(message.id, -32600, `Unsupported MCP-Protocol-Version ${version}; supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`);
    }
    // A notification: accepted, nothing to answer.
    if (message.id === undefined || message.id === null) return c.body(null, 202);

    // Every API call this request makes is labelled as the MCP surface in the call log.
    const headers = new Headers(c.req.raw.headers);
    headers.set(CALL_SURFACE_HEADER, 'mcp');
    const ctx: ToolContext = {
      authorization: c.req.header('Authorization')!,
      origin: oauthIssuer(new URL(c.req.url).origin),
      headers,
      dispatch,
      deadline: Date.now() + REQUEST_BUDGET_MS,
    };
    try {
      const result = await handleRpc(ctx, message.method, message.params ?? {}, mcpScopeOf(c.req.url));
      return c.json({ jsonrpc: '2.0', id: message.id, result });
    } catch (err) {
      // A database error's message is its statement: JSON-RPC's internal error instead, logged here.
      if (isDatabaseError(err)) {
        logger.error('[mcp] tool call failed on a database error', { method: message.method, error: databaseErrorSummary(err) });
        return c.json({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'Internal error' } });
      }
      const e = err as Error & { rpcCode?: number };
      return c.json({ jsonrpc: '2.0', id: message.id, error: { code: e.rpcCode ?? -32603, message: e.message } });
    }
  });

  // Stateless server: no SSE stream to open, no session to delete.
  app.on(['GET', 'DELETE'], '/', (c) => c.json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' }));

  return app;
}
