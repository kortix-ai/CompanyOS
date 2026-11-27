/**
 * Kortix's agent-identity MCP servers: MCP Streamable HTTP, JSON responses.
 *
 * `POST /<service>` with `Authorization: Bearer <the account's credential>`
 * (./state.ts). Answers `initialize`, `ping`, `tools/list` and `tools/call`;
 * HTTP 401 when the credential is missing or not this service's, so the
 * gateway marks it rejected; a tool error (`isError`) for a refused call.
 *
 * {@link dispatchKortixAgentMcp} is the in-process entry `../egress.ts` uses
 * for every request to `https://agent.mcp.kortix.com` (./host.ts).
 */
import { bearerToken } from '../../shared/bearer-token';
import { logger } from '../../lib/logger';
import { AUTHENTICATOR_TOOLS } from './authenticator';
import { kortixAgentServiceForUrl, type KortixAgentService } from './host';
import { type AccountState, decodeAccountState, InvalidAccountToken, saveAccountState } from './state';
import { type AgentTool, ToolInputError } from './tool';

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

const SERVICE_TITLES: Record<KortixAgentService, string> = {
  authenticator: 'Kortix Agent Authenticator',
  browser: 'Kortix Browser',
  phone: 'Kortix Phone',
};

// replica-local: the tool lists are code, identical on every process; services register theirs at import.
const TOOLS: Record<KortixAgentService, readonly AgentTool<never>[]> = {
  authenticator: AUTHENTICATOR_TOOLS as readonly AgentTool<never>[],
  browser: [],
  phone: [],
};

/** A service adds its tools (the browser and phone files call this at import). */
export function registerKortixAgentTools(service: KortixAgentService, tools: readonly AgentTool<never>[]): void {
  TOOLS[service] = tools;
}

export function kortixAgentTools(service: KortixAgentService): readonly AgentTool<never>[] {
  return TOOLS[service];
}

type Answer = { status: number; body: unknown; headers?: Record<string, string> };
interface Rpc { id: string | number; method: string; params: Record<string, unknown> }

const rpcError = (id: unknown, code: number, message: string, status = 400): Answer => ({
  status,
  body: { jsonrpc: '2.0', id: id ?? null, error: { code, message } },
});

const UNAUTHORIZED = (description: string): Answer => ({
  status: 401,
  body: { error: 'invalid_token', error_description: description },
  headers: { 'WWW-Authenticate': `Bearer error="invalid_token", error_description="${description}"` },
});

function toolResult(output: unknown): Record<string, unknown> {
  const structured = output && typeof output === 'object' && !Array.isArray(output) ? (output as Record<string, unknown>) : { result: output };
  return { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured };
}

const toolError = (message: string) => ({ content: [{ type: 'text', text: message }], isError: true });

export function toolListing(tool: AgentTool<never>): Record<string, unknown> {
  return { name: tool.name, title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: { title: tool.title, ...tool.annotations } };
}

let clock = () => Date.now();
/** Tests fix the clock; never called in production. */
export function setKortixAgentClockForTests(fn: (() => number) | null): void {
  clock = fn ?? (() => Date.now());
}

async function callTool(service: KortixAgentService, rpc: Rpc, state: AccountState): Promise<Answer> {
  const name = rpc.params.name;
  if (typeof name !== 'string') return rpcError(rpc.id, -32602, 'Invalid params: name must be a tool name');
  const tool = TOOLS[service].find((t) => t.name === name) as AgentTool<Record<string, unknown>> | undefined;
  if (!tool) return rpcError(rpc.id, -32602, `Unknown tool: ${name}. tools/list names the ${SERVICE_TITLES[service]} tools.`);
  const args = rpc.params.arguments && typeof rpc.params.arguments === 'object' ? (rpc.params.arguments as Record<string, unknown>) : {};
  let current = state;
  const ctx = {
    get state() { return current; },
    save: async (data: Record<string, unknown>) => {
      current = { ...current, data };
      await saveAccountState(current);
    },
    now: () => clock(),
  };
  try {
    const output = await tool.run(args, ctx);
    return { status: 200, body: { jsonrpc: '2.0', id: rpc.id, result: toolResult(output) } };
  } catch (error) {
    if (error instanceof ToolInputError) {
      return { status: 200, body: { jsonrpc: '2.0', id: rpc.id, result: toolError(error.message) } };
    }
    logger.warn('[kortix-agent-mcp] tool failed', { service, tool: name, error: error instanceof Error ? error.message : String(error) });
    return { status: 200, body: { jsonrpc: '2.0', id: rpc.id, result: toolError(`${SERVICE_TITLES[service]} ${name} failed: ${error instanceof Error ? error.message : String(error)}`) } };
  }
}

async function answer(service: KortixAgentService, request: Request): Promise<Answer> {
  if (request.method !== 'POST') return { status: 405, body: { error: 'method_not_allowed' }, headers: { Allow: 'POST' } };
  let message: unknown;
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }
  if (Array.isArray(message)) return rpcError(null, -32600, 'Invalid Request: batches are not supported');
  if (!message || typeof message !== 'object' || (message as { jsonrpc?: unknown }).jsonrpc !== '2.0') {
    return rpcError(null, -32600, 'Invalid Request: jsonrpc must be "2.0"');
  }
  const record = message as Record<string, unknown>;
  if (typeof record.method !== 'string') return { status: 202, body: null };
  if (record.id === undefined || record.id === null) return { status: 202, body: null };
  const rpc: Rpc = {
    id: record.id as string | number,
    method: record.method,
    params: record.params && typeof record.params === 'object' ? (record.params as Record<string, unknown>) : {},
  };
  const token = bearerToken(request.headers.get('authorization') ?? undefined);
  if (!token) return UNAUTHORIZED('A Kortix agent account credential is required');
  let state: AccountState;
  try {
    state = decodeAccountState(token, service);
  } catch (error) {
    if (error instanceof InvalidAccountToken) return UNAUTHORIZED(error.message);
    throw error;
  }
  switch (rpc.method) {
    case 'initialize': {
      const requested = String(rpc.params.protocolVersion ?? '');
      return {
        status: 200,
        body: {
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
            serverInfo: { name: `kortix-agent-${service}`, title: SERVICE_TITLES[service], version: '1' },
            capabilities: { tools: {} },
          },
        },
      };
    }
    case 'ping':
      return { status: 200, body: { jsonrpc: '2.0', id: rpc.id, result: {} } };
    case 'tools/list':
      return { status: 200, body: { jsonrpc: '2.0', id: rpc.id, result: { tools: TOOLS[service].map(toolListing) } } };
    case 'tools/call':
      return callTool(service, rpc, state);
    default:
      return rpcError(rpc.id, -32601, `Method not found: ${rpc.method}`);
  }
}

/** Serve one request to a Kortix agent MCP URL in-process. */
export async function dispatchKortixAgentMcp(request: Request): Promise<Response> {
  const service = kortixAgentServiceForUrl(request.url);
  if (!service) return Response.json({ error: 'not_found' }, { status: 404 });
  const result = await answer(service, request);
  if (result.status === 202 || result.body === null) return new Response(null, { status: result.status, headers: result.headers });
  return Response.json(result.body, { status: result.status, headers: result.headers });
}
