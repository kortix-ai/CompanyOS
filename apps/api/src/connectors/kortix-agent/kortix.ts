/**
 * The `kortix` connector: the Kortix API as a connector. Its tools are the
 * operations of the API that agents may reach (`x-kortix-exposure: agent`),
 * read from the routes at boot (`shared/operation-registry.ts`). A call runs
 * the route in this process as its caller (`shared/in-process-caller.ts`), so
 * the caller's IAM role decides in the handler, as for a direct API call; the
 * gateway already decided the call's rules, holds and approvals.
 *
 * Design: `.agents/skills/learnings/work/kortix-surface/README.md`.
 */
import { allOperations, type CatalogOperation } from '../../shared/operation-registry';
import { runInProcess } from '../../shared/in-process-caller';
import { DESTRUCTIVE, READ, WRITE, ToolInputError, type AgentTool } from './tool';

/** The host of an in-process request: never resolved, never leaves the process. */
const IN_PROCESS_ORIGIN = 'http://kortix.in-process';
/** The longest response body text a tool error repeats. */
const MAX_ERROR_TEXT = 2_000;

/** The tool input: path and query parameters as properties, the JSON body as `body`. */
export function operationInputSchema(op: CatalogOperation): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of op.parameters) {
    properties[p.name] = { ...p.schema, ...(p.description ? { description: p.description } : {}) };
    if (p.required) required.push(p.name);
  }
  if (op.body) {
    properties.body = { ...op.body, description: 'The JSON request body.' };
    if (op.bodyRequired) required.push('body');
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false };
}

/** The request an operation call makes: path parameters filled, query parameters set, the body as JSON. */
export function operationRequest(op: CatalogOperation, args: Record<string, unknown>): Request {
  let path = op.path;
  const query = new URLSearchParams();
  for (const p of op.parameters) {
    const value = args[p.name];
    if (value === undefined || value === null) {
      if (p.required) throw new ToolInputError(`${op.operation.id} needs "${p.name}".`);
      continue;
    }
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (p.in === 'path') path = path.replace(new RegExp(`:${p.name}(\\{[^}]*\\})?(?=/|$)`), encodeURIComponent(text));
    else query.set(p.name, text);
  }
  const known = new Set([...op.parameters.map((p) => p.name), 'body']);
  const unknown = Object.keys(args).filter((k) => !known.has(k));
  if (unknown.length) throw new ToolInputError(`${op.operation.id} takes no ${unknown.map((k) => `"${k}"`).join(', ')}. Describe it for its input.`);
  const hasBody = op.body !== null && args.body !== undefined;
  if (op.bodyRequired && !hasBody) throw new ToolInputError(`${op.operation.id} needs "body".`);
  const qs = query.toString();
  return new Request(`${IN_PROCESS_ORIGIN}${path}${qs ? `?${qs}` : ''}`, {
    method: op.method,
    headers: hasBody ? { 'content-type': 'application/json' } : {},
    ...(hasBody ? { body: JSON.stringify(args.body) } : {}),
  });
}

function operationTool(op: CatalogOperation): AgentTool<never> {
  const { operation } = op;
  const summary = operation.summary ?? operation.id;
  return {
    name: operation.id,
    title: summary,
    description: `${summary}. ${op.method} ${op.path}; needs ${operation.action === 'none' ? 'no IAM action' : `the IAM action ${operation.action}`}.`,
    inputSchema: operationInputSchema(op),
    annotations: op.method === 'GET' ? READ : op.method === 'DELETE' ? DESTRUCTIVE : WRITE,
    async run(args, ctx) {
      if (!ctx.caller) {
        throw new ToolInputError('The kortix connector acts as its caller: call it with an account token (a session, the CLI, an API key).');
      }
      const response = await runInProcess(operationRequest(op, args), ctx.caller);
      const text = await response.text();
      let data: unknown = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // A non-JSON body stays text.
      }
      if (!response.ok) throw new ToolInputError(`${operation.id} answered HTTP ${response.status}: ${text.slice(0, MAX_ERROR_TEXT)}`);
      return { status: response.status, data };
    },
  };
}

// replica-local: built once from this process's route registry, on first use.
let tools: readonly AgentTool<never>[] | null = null;

/** Every `agent` operation as a tool, in id order. */
export function kortixOperationTools(): readonly AgentTool<never>[] {
  tools ??= allOperations()
    .filter((op) => op.operation.exposure === 'agent')
    .sort((a, b) => a.operation.id.localeCompare(b.operation.id))
    .map(operationTool);
  return tools;
}
