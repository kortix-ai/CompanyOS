/**
 * The tool core's sources for the hosted API: built-ins (the session, sandbox
 * and connector-admin tools the MCP server always had), every Kortix API
 * operation, and the connectors of one project. Every call runs in-process
 * through the real API routes with the caller's own token, so access,
 * policies, approvals and the call log are exactly the API's.
 */
import type { ToolCallOutcome, ToolEntry, ToolRisk, ToolSource } from '@kortix/agent-tools';
import { CALL_SURFACE_HEADER, type CallSurface } from '@kortix/api-contract/tool-calls';
import { CONNECTOR_TOOLS, denialNext, splitTool } from './connectors';
import { KORTIX_TOOL } from './cli';
import { callApi, loadCatalog, resolveRefs, runTool, TOOLS, ToolInputError, type ToolContext, type ToolResult } from './runtime';

/** Built-in tool id → the MCP tool that implements it. */
export const BUILTIN_IDS: Readonly<Record<string, string>> = {
  'projects.list': 'list_projects',
  'projects.search': 'search_project',
  'sessions.start': 'start_session',
  'sessions.send_message': 'send_message',
  'sessions.read': 'read_session',
  'sessions.list': 'list_sessions',
  'sandbox.run_command': 'run_command',
  'sandbox.read_file': 'read_file',
  'sandbox.write_file': 'write_file',
  'sandbox.list_files': 'list_files',
  'connector_admin.list': 'list_connectors',
  'connector_admin.accounts': 'list_connector_accounts',
  'connector_admin.connect': 'connect_connector',
  'connector_admin.upload_attachment': 'upload_connector_attachment',
  'connector_admin.search_apps': 'search_connector_apps',
  'connector_admin.get_app': 'get_connector_app',
  'connector_admin.add': 'add_connector',
  'connector_admin.remove': 'remove_connector',
  'cli.run': 'kortix',
};

type McpToolDef = { name: string; title?: string; description: string; inputSchema: unknown; annotations?: Record<string, unknown> };

function riskOf(annotations: Record<string, unknown> | undefined): ToolRisk {
  if (annotations?.readOnlyHint) return 'read';
  if (annotations?.destructiveHint) return 'destructive';
  return 'write';
}

/** A ToolResult's text as data: JSON when it parses, the text otherwise. */
export function resultOutcome(result: ToolResult): ToolCallOutcome {
  const text = result.content.map((c) => (c.type === 'text' ? c.text : `[${c.mimeType} image]`)).join('\n');
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return result.isError
    ? { status: 'error', reason: 'tool_error', message: text.slice(0, 2000), data }
    : { status: 'ok', data };
}

async function runBuiltin(ctx: ToolContext, name: string, input: Record<string, unknown>): Promise<ToolCallOutcome> {
  try {
    return resultOutcome(await runTool(ctx, name, input));
  } catch (err) {
    if (err instanceof ToolInputError) return { status: 'error', reason: 'invalid_input', message: err.message };
    throw err;
  }
}

/** One source per built-in family, so the core routes by prefix. */
export function builtinSources(ctx: ToolContext, defaults: { projectId: string | null }): ToolSource[] {
  const defs = new Map<string, McpToolDef>(
    [...(TOOLS as readonly McpToolDef[]), ...(CONNECTOR_TOOLS as readonly McpToolDef[]), KORTIX_TOOL as McpToolDef].map((t) => [t.name, t]),
  );
  const entries: ToolEntry[] = Object.entries(BUILTIN_IDS).flatMap(([id, name]) => {
    const def = defs.get(name);
    if (!def) return [];
    return [{
      id,
      title: def.title ?? name,
      description: def.description,
      risk: riskOf(def.annotations),
      inputSchema: def.inputSchema as Record<string, unknown>,
      keywords: [name.replace(/_/g, ' ')],
    }];
  });
  const families = [...new Set(entries.map((e) => `${e.id.split('.')[0]}.`))];
  return families.map((prefix) => ({
    prefix,
    list: async () => entries.filter((e) => e.id.startsWith(prefix)),
    call: async (id, input) => {
      const name = BUILTIN_IDS[id];
      if (!name) return { status: 'error', reason: 'unknown_tool', message: `No tool has the id "${id}".` };
      const withProject = defaults.projectId && input.project_id === undefined ? { ...input, project_id: defaults.projectId } : input;
      return runBuiltin(ctx, name, withProject);
    },
  }));
}

/** `kortix.<METHOD> <path>`. */
export function kortixOpId(method: string, path: string): string {
  return `kortix.${method.toUpperCase()} ${path}`;
}

function parseKortixOpId(id: string): { method: string; path: string } | null {
  const m = /^kortix\.(GET|POST|PUT|PATCH|DELETE) (\/v1\/\S+)$/.exec(id);
  return m ? { method: m[1]!, path: m[2]! } : null;
}

/** Every Kortix API operation the OpenAPI document lists (minus OAuth and MCP routes). */
export function kortixApiSource(ctx: ToolContext, defaults: { projectId: string | null }): ToolSource {
  return {
    prefix: 'kortix.',
    async list() {
      const { ops } = await loadCatalog(ctx);
      return ops.map((op) => ({
        id: kortixOpId(op.method, op.path),
        title: op.summary || `${op.method} ${op.path}`,
        description: (op.description || op.summary || '').slice(0, 600),
        risk: op.method === 'GET' ? 'read' : op.method === 'DELETE' ? 'destructive' : 'write',
        keywords: op.tags,
      }));
    },
    async describe(id) {
      const parsed = parseKortixOpId(id);
      if (!parsed) return null;
      const { ops, doc } = await loadCatalog(ctx);
      const op = ops.find((o) => o.method === parsed.method && o.path === parsed.path);
      if (!op) return null;
      const spec = resolveRefs(op.spec, doc);
      const bodySchema = spec?.requestBody?.content?.['application/json']?.schema ?? null;
      const params = Array.isArray(spec?.parameters) ? spec.parameters : [];
      const props: Record<string, unknown> = {
        params: {
          type: 'object',
          description: 'Path parameters. project_id (or the call default) fills {workspaceId} / {projectId}.',
          properties: Object.fromEntries(params.filter((p: any) => p.in === 'path').map((p: any) => [p.name, p.schema ?? { type: 'string' }])),
        },
        query: {
          type: 'object',
          properties: Object.fromEntries(params.filter((p: any) => p.in === 'query').map((p: any) => [p.name, p.schema ?? { type: 'string' }])),
        },
        ...(bodySchema ? { body: bodySchema } : {}),
        project_id: { type: 'string', description: 'Fills {workspaceId} / {projectId}.' },
      };
      const ok = spec?.responses?.['200'] ?? spec?.responses?.['201'];
      return {
        id,
        title: op.summary || id,
        description: op.description || op.summary || '',
        risk: op.method === 'GET' ? 'read' : op.method === 'DELETE' ? 'destructive' : 'write',
        inputSchema: { type: 'object', properties: props },
        outputSchema: ok?.content?.['application/json']?.schema ?? null,
      };
    },
    async call(id, input) {
      const parsed = parseKortixOpId(id);
      if (!parsed) return { status: 'error', reason: 'unknown_tool', message: `"${id}" is not a Kortix API operation id (kortix.<METHOD> </v1/path>).` };
      let path = parsed.path;
      const params = input.params && typeof input.params === 'object' ? (input.params as Record<string, unknown>) : {};
      for (const [key, value] of Object.entries(params)) path = path.replaceAll(`{${key}}`, encodeURIComponent(String(value)));
      const projectId = (typeof input.project_id === 'string' ? input.project_id : null) ?? defaults.projectId;
      const outcome = await runBuiltin(ctx, 'call_api', {
        method: parsed.method,
        path,
        ...(projectId ? { project_id: projectId } : {}),
        ...(input.query !== undefined ? { query: input.query } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
      });
      return httpOutcome(outcome);
    },
  };
}

/** call_api answers `METHOD path → HTTP status\n<body>`: map it to ok / error with the body as data. */
function httpOutcome(outcome: ToolCallOutcome): ToolCallOutcome {
  const raw = outcome.status === 'ok' ? outcome.data : 'data' in outcome ? outcome.data : null;
  if (typeof raw !== 'string') return outcome;
  const m = /^[A-Z]+ \S+ → HTTP (\d{3})[^\n]*\n?([\s\S]*)$/.exec(raw);
  if (!m) return outcome;
  const status = Number(m[1]);
  let body: unknown = m[2] ?? '';
  try {
    body = JSON.parse(String(body));
  } catch {
    /* text body */
  }
  if (status < 400) return { status: 'ok', data: body };
  const message = body && typeof body === 'object' && typeof (body as any).error === 'string' ? (body as any).error : `HTTP ${status}`;
  return { status: status === 403 ? 'denied' : 'error', reason: `http_${status}`, message, data: body };
}

interface CatalogEntry {
  slug: string;
  name: string;
  actions: Array<{ path: string; name?: string; description?: string; risk: string; inputSchema?: unknown }>;
}

/** `connectors.<slug>.<action>` for one project: the catalog THIS caller may call. */
export function connectorSource(ctx: ToolContext, projectId: string | null, surface: CallSurface): ToolSource {
  const base = projectId ? `/v1/connectors/projects/${projectId}` : null;
  let catalog: Promise<CatalogEntry[]> | null = null;
  const load = (): Promise<CatalogEntry[]> => {
    if (!base) return Promise.resolve([]);
    catalog ??= callApi(ctx, 'GET', `${base}/catalog`, { query: { include_schemas: true } }).then((r) =>
      r.status < 400 ? ((JSON.parse(r.body)?.connectors ?? []) as CatalogEntry[]) : [],
    );
    return catalog;
  };
  const toEntry = (c: CatalogEntry, a: CatalogEntry['actions'][number]): ToolEntry => ({
    id: `connectors.${c.slug}.${a.path}`,
    title: a.name || a.path,
    description: a.description || a.name || '',
    risk: (['read', 'write', 'destructive'].includes(a.risk) ? a.risk : 'write') as ToolRisk,
    inputSchema: (a.inputSchema as Record<string, unknown>) ?? null,
    keywords: [c.name, c.slug],
  });
  return {
    prefix: 'connectors.',
    async list() {
      return (await load()).flatMap((c) => c.actions.map((a) => toEntry(c, a)));
    },
    async describe(id) {
      const parts = splitTool(id.slice('connectors.'.length));
      if (!parts) return null;
      const c = (await load()).find((x) => x.slug === parts.connector);
      const a = c?.actions.find((x) => x.path === parts.action);
      return c && a ? toEntry(c, a) : null;
    },
    async call(id, input) {
      if (!base) {
        return { status: 'error', reason: 'project_required', message: 'Connector tools belong to a project: pass project_id (projects.list shows them).' };
      }
      const parts = splitTool(id.slice('connectors.'.length));
      if (!parts) return { status: 'error', reason: 'unknown_tool', message: `"${id}" is not connectors.<slug>.<action>.` };
      const { account, reason, ...args } = input as Record<string, unknown> & { account?: unknown; reason?: unknown };
      const r = await callApi(
        { ...ctx, headers: withSurface(ctx.headers, surface) },
        'POST',
        `${base}/call`,
        {
          body: {
            connector: parts.connector,
            action: parts.action,
            args,
            ...(typeof account === 'string' ? { account } : {}),
            ...(typeof reason === 'string' ? { approval_context: reason } : {}),
          },
        },
      );
      return connectorOutcome(r.status, r.body);
    },
  };
}

function withSurface(headers: Headers, surface: CallSurface): Headers {
  const out = new Headers(headers);
  out.set(CALL_SURFACE_HEADER, surface);
  return out;
}

/** The gateway's `/call` answer as a tool outcome. */
export function connectorOutcome(status: number, raw: string): ToolCallOutcome {
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 'error', reason: `http_${status}`, message: raw.slice(0, 500) };
  }
  if (status < 400 && body?.ok === true) return { status: 'ok', data: body.data };
  if (body?.status === 'pending_approval') {
    return {
      status: 'pending_approval',
      executionId: body.execution_id ?? null,
      approvalUrl: body.approval_url ?? null,
      runsOnApproval: body.runs_on_approval === true,
      message:
        body.runs_on_approval === true
          ? String(body.approval_instructions ?? 'A person approves this call; Kortix then runs it once. Do not call it again; `resume` with the execution_id reads its outcome.')
          : 'A person approves this call at approval_url. After approval, call it again with the same input.',
    };
  }
  if (body?.status === 'tool_error') return { status: 'error', reason: 'tool_error', message: String(body.error ?? 'The tool reported an error.'), data: body.data };
  const reason = typeof body?.reason === 'string' ? body.reason : `http_${status}`;
  const message = String(body?.message ?? denialNext(reason, body) ?? body?.error ?? reason);
  return { status: status === 403 || body?.status === 'denied' ? 'denied' : 'error', reason, message, data: body };
}
