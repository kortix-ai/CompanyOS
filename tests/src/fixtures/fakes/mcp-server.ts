/**
 * A loopback MCP server on the streamable HTTP transport, JSON responses only.
 *
 * `POST <path>` takes one JSON-RPC message: `initialize`,
 * `notifications/initialized` (any notification answers 202), `ping`,
 * `tools/list` and `tools/call`. Tools are configured with handlers.
 *
 * Optional bearer auth (`auth`): with `{ issuer }` an unauthenticated request
 * gets 401 + `WWW-Authenticate: Bearer resource_metadata="…"`, and the RFC 9728
 * protected-resource metadata is served unauthenticated at
 * `/.well-known/oauth-protected-resource<path>` and
 * `/.well-known/oauth-protected-resource`.
 *
 * `sessions: true` issues `Mcp-Session-Id` on initialize and answers 400 to a
 * later request without it, like a stateful server.
 */
import { randomUUID } from 'node:crypto';
import { type BearerAuth, checkBearer, protectedResourceMetadata, protectedResourceMetadataPath } from './bearer-auth';
import { type LoopbackTls, type RecordedRequest, parseJson, sendJson, startLoopback } from './http';

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string } | Record<string, unknown>>;
  isError?: boolean;
  structuredContent?: unknown;
}

export interface FakeMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  /**
   * Returns an MCP tool result, or any other value, which is answered as one
   * JSON text block. A throw answers `isError: true` with the message.
   */
  handler?: (args: Record<string, unknown>, request: RecordedRequest) => unknown | Promise<unknown>;
}

export interface McpServerOptions {
  tools?: FakeMcpTool[];
  /** Endpoint path. Default '/mcp'. */
  path?: string;
  auth?: BearerAuth;
  sessions?: boolean;
  protocolVersion?: string;
  serverInfo?: { name: string; version: string };
  tls?: LoopbackTls;
}

export interface McpCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  authorization: string | undefined;
}

export interface FakeMcpServer {
  /** The MCP endpoint: origin + path. */
  url: string;
  origin: string;
  /** RFC 9728 metadata URL (served only when `auth` has an issuer). */
  resourceMetadataUrl: string;
  /** Every HTTP request, including refused ones. */
  requests: RecordedRequest[];
  /** Every `tools/call` that passed auth. */
  calls: McpCallRecord[];
  /** JSON-RPC method of every request, in order ('' when the body was not JSON-RPC). */
  methods(): string[];
  /** Replace the tool list (the next tools/list sees it). */
  setTools(tools: FakeMcpTool[]): void;
  close(): Promise<void>;
}

interface RpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const isToolResult = (value: unknown): value is McpToolResult =>
  !!value && typeof value === 'object' && Array.isArray((value as { content?: unknown }).content);

export async function startMcpServer(options: McpServerOptions = {}): Promise<FakeMcpServer> {
  const path = options.path ?? '/mcp';
  let tools = options.tools ?? [];
  const calls: McpCallRecord[] = [];
  const sessions = new Set<string>();
  let origin = '';
  const metadataPath = protectedResourceMetadataPath(path);

  const server = await startLoopback(
    async (req, res) => {
      if (req.method === 'GET' && options.auth && 'issuer' in options.auth && (req.path === metadataPath || req.path === '/.well-known/oauth-protected-resource')) {
        return sendJson(res, 200, protectedResourceMetadata(options.auth, `${origin}${path}`));
      }
      if (!checkBearer(options.auth, req, res, `${origin}${metadataPath}`)) return;
      if (req.path !== path) return sendJson(res, 404, { error: 'not_found' });
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        return void res.end();
      }
      const msg = (parseJson(req.body) ?? {}) as RpcMessage;
      if (msg.method !== 'initialize' && options.sessions) {
        const presented = req.headers['mcp-session-id'];
        if (!presented || !sessions.has(presented)) {
          return sendJson(res, 400, { jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32000, message: 'Bad Request: Mcp-Session-Id header is required' } });
        }
      }
      // A notification has no id: accepted, no body.
      if (msg.id === undefined || msg.id === null) {
        res.writeHead(202);
        return void res.end();
      }
      const reply = (result: unknown, headers: Record<string, string> = {}) =>
        sendJson(res, 200, { jsonrpc: '2.0', id: msg.id, result }, headers);
      const fail = (code: number, message: string) =>
        sendJson(res, 200, { jsonrpc: '2.0', id: msg.id, error: { code, message } });

      switch (msg.method) {
        case 'initialize': {
          const headers: Record<string, string> = {};
          if (options.sessions) {
            const id = randomUUID();
            sessions.add(id);
            headers['mcp-session-id'] = id;
          }
          return reply(
            {
              protocolVersion: options.protocolVersion ?? '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: options.serverInfo ?? { name: 'ke2e-fake-mcp', version: '1' },
            },
            headers,
          );
        }
        case 'ping':
          return reply({});
        case 'tools/list':
          return reply({
            tools: tools.map((t) => ({
              name: t.name,
              ...(t.description ? { description: t.description } : {}),
              inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
              ...(t.annotations ? { annotations: t.annotations } : {}),
            })),
          });
        case 'tools/call': {
          const name = typeof msg.params?.name === 'string' ? msg.params.name : '';
          const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
          const tool = tools.find((t) => t.name === name);
          if (!tool) return fail(-32602, `Unknown tool: ${name}`);
          calls.push({ name, arguments: args, authorization: req.headers.authorization });
          try {
            const value = tool.handler ? await tool.handler(args, req) : { ok: true };
            return reply(isToolResult(value) ? value : { content: [{ type: 'text', text: JSON.stringify(value) }] });
          } catch (error) {
            return reply({ isError: true, content: [{ type: 'text', text: (error as Error).message }] });
          }
        }
        default:
          return fail(-32601, `Method not found: ${msg.method ?? ''}`);
      }
    },
    { tls: options.tls },
  );
  origin = server.origin;

  return {
    url: `${origin}${path}`,
    origin,
    resourceMetadataUrl: `${origin}${metadataPath}`,
    requests: server.requests,
    calls,
    methods: () => server.requests.map((r) => ((parseJson(r.body) ?? {}) as RpcMessage).method ?? ''),
    setTools: (next) => void (tools = next),
    close: server.close,
  };
}
