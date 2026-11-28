/**
 * The operation of each API route, read from the routes themselves: the stable
 * `operationId`, the IAM action (`x-kortix-action`) and who may reach it
 * (`x-kortix-exposure`). One join of the route table and the OpenAPI document,
 * used at run time (the agent rule gate) and by `scripts/operation-catalog.ts`.
 * Design: `.agents/skills/learnings/work/kortix-surface/README.md`.
 */
import type { Context } from 'hono';
import { matchedRoutes } from 'hono/route';
import { workspaceAliasOf } from '@kortix/shared/workspace-routes';

export const EXPOSURES = ['agent', 'human', 'internal', 'local'] as const;
export type Exposure = (typeof EXPOSURES)[number];

export interface Operation {
  id: string;
  action: string;
  exposure: Exposure;
  /** The HTTP method of its canonical route: `GET` reads, anything else writes. */
  method: string;
  summary: string | null;
  tags: string[];
}

/** One path or query parameter of an operation. */
export interface OperationParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description?: string;
  schema: Record<string, unknown>;
}

/** An operation by id, with the canonical route that serves it and its input. */
export interface CatalogOperation {
  operation: Operation;
  method: string;
  path: string;
  parameters: OperationParameter[];
  /** The JSON request body schema, or null when the operation takes none. */
  body: Record<string, unknown> | null;
  bodyRequired: boolean;
}

interface RouteRow {
  method: string;
  path: string;
  handler: (...args: unknown[]) => unknown;
}

/** The app shape this module reads: the route table and the OpenAPI document. */
export interface OperationSource {
  routes: unknown;
  getOpenAPI31Document(config: unknown): { paths?: Record<string, Record<string, Record<string, unknown>>> };
}

// A parameter starts a segment; a colon inside one is a literal custom verb (`/policies:bulk-delete`).
export const toOpenApiPath = (path: string) => path.replace(/(?<=\/):([A-Za-z0-9_]+)(\{[^}]*\})?/g, '{$1}');
export const routeKey = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

/**
 * Every concrete route: no `use()` middleware (listed as `ALL` with a
 * `(c, next)` handler; an `.all()` passthrough takes `(c)`), no `OPTIONS`, each
 * method and path once. `withAliases: false` drops a legacy workspace name of
 * a canonical route (one operation, as in dump-routes.ts).
 */
export function concreteRoutes(source: OperationSource, withAliases: boolean): Array<{ method: string; path: string }> {
  const rows = (source.routes as RouteRow[])
    .map((r) => ({ method: r.method.toUpperCase(), path: r.path, handler: r.handler }))
    .filter((r) => r.method !== 'OPTIONS' && !(r.method === 'ALL' && r.handler.length >= 2));
  const all = new Set(rows.map((r) => routeKey(r.method, r.path)));
  const seen = new Set<string>();
  const out: Array<{ method: string; path: string }> = [];
  for (const r of rows) {
    if (!withAliases && workspaceAliasOf(r.method, r.path, (m, p) => all.has(routeKey(m, p)))) continue;
    const k = routeKey(r.method, r.path);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ method: r.method, path: r.path });
  }
  return out;
}

/** The OpenAPI operation object of each route, null when the route is untyped. */
export function openApiOperations(source: OperationSource): (method: string, path: string) => Record<string, unknown> | null {
  const paths =
    source.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'Kortix operation catalog', version: 'catalog' } }).paths ?? {};
  return (method, path) => paths[toOpenApiPath(path)]?.[method.toLowerCase()] ?? null;
}

/** The operation an OpenAPI operation object declares, or null when it is not classified. */
export function operationOf(op: Record<string, unknown> | null, method: string): Operation | null {
  const id = op?.operationId;
  const action = op?.['x-kortix-action'];
  const exposure = op?.['x-kortix-exposure'];
  if (typeof id !== 'string' || typeof action !== 'string' || !(EXPOSURES as readonly string[]).includes(exposure as string)) {
    return null;
  }
  return {
    id,
    action,
    exposure: exposure as Exposure,
    method: method.toUpperCase(),
    summary: typeof op?.summary === 'string' ? op.summary : null,
    tags: Array.isArray(op?.tags) ? (op.tags as string[]) : [],
  };
}

// replica-local: built once at boot from this process's own route table.
const registry = new Map<string, Operation>();
// replica-local: the same operations by id, for the `kortix` connector.
const byId = new Map<string, CatalogOperation>();

/** The path and query parameters and the JSON body an OpenAPI operation declares. */
function operationInput(op: Record<string, unknown>): Pick<CatalogOperation, 'parameters' | 'body' | 'bodyRequired'> {
  const parameters: OperationParameter[] = [];
  for (const raw of Array.isArray(op.parameters) ? (op.parameters as Array<Record<string, unknown>>) : []) {
    if ((raw.in !== 'path' && raw.in !== 'query') || typeof raw.name !== 'string') continue;
    parameters.push({
      name: raw.name,
      in: raw.in,
      required: raw.in === 'path' || raw.required === true,
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      schema: raw.schema && typeof raw.schema === 'object' ? (raw.schema as Record<string, unknown>) : { type: 'string' },
    });
  }
  const requestBody = op.requestBody as { required?: boolean; content?: Record<string, { schema?: Record<string, unknown> }> } | undefined;
  const body = requestBody?.content?.['application/json']?.schema ?? null;
  return { parameters, body, bodyRequired: Boolean(body && requestBody?.required) };
}

/**
 * Build the registry from the app's routes. A legacy workspace name maps to
 * the operation of its canonical route. Called once by `app.ts` after every
 * route is mounted.
 */
export function installOperationRegistry(source: OperationSource): void {
  registry.clear();
  byId.clear();
  const operation = openApiOperations(source);
  const routes = concreteRoutes(source, true);
  const all = new Set(routes.map((r) => routeKey(r.method, r.path)));
  for (const r of routes) {
    const canonical = workspaceAliasOf(r.method, r.path, (m, p) => all.has(routeKey(m, p)));
    const raw = operation(r.method, r.path) ?? (canonical ? operation(r.method, canonical) : null);
    const op = operationOf(raw, r.method);
    if (!op || !raw) continue;
    registry.set(routeKey(r.method, r.path), op);
    if (!canonical && !byId.has(op.id)) byId.set(op.id, { operation: op, method: r.method, path: r.path, ...operationInput(raw) });
  }
}

/** The operation of a method and a registered route path (`/v1/workspaces/:workspaceId/secrets`). */
export function operationForRoute(method: string, path: string): Operation | null {
  return registry.get(routeKey(method, path)) ?? null;
}

/** An operation by id, with the canonical route that serves it. */
export function operationById(id: string): CatalogOperation | null {
  return byId.get(id) ?? null;
}

/** Every operation once, by id. */
export function allOperations(): CatalogOperation[] {
  return [...byId.values()];
}

/**
 * The operation of the request and the route path that serves it: the last
 * matched route that is an operation. The router matched every route before
 * the first middleware ran, so a middleware sees the handler's route too.
 */
export function requestOperation(c: Context): { operation: Operation; path: string } | null {
  // HEAD is served by the GET route.
  const method = c.req.method.toUpperCase() === 'HEAD' ? 'GET' : c.req.method.toUpperCase();
  const routes = matchedRoutes(c);
  for (let i = routes.length - 1; i >= 0; i--) {
    const r = routes[i]!;
    if (r.method !== method && r.method !== 'ALL') continue;
    const operation = registry.get(routeKey(method, r.path));
    if (operation) return { operation, path: r.path };
  }
  return null;
}

/** The path parameters of `requestPath` under the route path `routePath` (`/x/:id` → `{ id }`). */
export function pathParams(routePath: string, requestPath: string): Record<string, string> {
  const names: string[] = [];
  const pattern = routePath
    .split('/')
    .map((segment) => {
      const m = /^:([A-Za-z0-9_]+)(\{[^}]*\})?$/.exec(segment);
      if (!m) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(m[1]!);
      return '([^/]+)';
    })
    .join('/');
  const match = new RegExp(`^${pattern}/?$`).exec(requestPath);
  if (!match) return {};
  const out: Record<string, string> = {};
  names.forEach((name, i) => {
    try {
      out[name] = decodeURIComponent(match[i + 1]!);
    } catch {
      out[name] = match[i + 1]!;
    }
  });
  return out;
}
