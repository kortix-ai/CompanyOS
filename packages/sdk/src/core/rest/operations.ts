/**
 * Every Kortix API operation by its stable id (`secrets.set`,
 * `sessions.list`): the same catalog the CLI, MCP and the `kortix` connector
 * are built from. `callOperation` reaches any of them through the one auth
 * seam (`getToken`), with no hand-written client function per route.
 *
 * The catalog is generated from the API's own routes
 * (`apps/api/scripts/operation-catalog.ts`).
 */
import { backendApi } from '../http/api-client';
import { OPERATION_CATALOG } from './operations.generated';

/** The id of a Kortix API operation, e.g. `secrets.set`. */
export type OperationId = (typeof OPERATION_CATALOG)[number]['id'];

/** One Kortix API operation a client may call. */
export interface OperationDescriptor {
  id: OperationId;
  method: string;
  /** The path under the backend URL, parameters as `:name` (`/workspaces/:workspaceId/secrets`). */
  path: string;
  /** The IAM action the API checks, or `none`. */
  action: string;
  /** `agent`: people and agents; `human`: people only; `local`: a machine-local CLI concern. */
  exposure: 'agent' | 'human' | 'local';
  summary: string | null;
  parameters: ReadonlyArray<{ name: string; in: 'path' | 'query'; required: boolean }>;
  /** True when the operation takes a JSON body (`body` in the call arguments). */
  body: boolean;
}

/** The arguments of an operation call: its path and query parameters by name, and its JSON body as `body`. */
export interface OperationCallArgs {
  [parameter: string]: unknown;
  body?: unknown;
}

/** Every operation a client may call, in id order. */
export function listOperations(): readonly OperationDescriptor[] {
  return OPERATION_CATALOG as readonly OperationDescriptor[];
}

const byId = new Map<string, OperationDescriptor>();

function operation(id: string): OperationDescriptor {
  if (byId.size === 0) for (const op of listOperations()) byId.set(op.id, op);
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown Kortix operation "${id}". listOperations() names every operation.`);
  return found;
}

const text = (value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value));

/** The endpoint of a call: path parameters filled and encoded, every other argument but `body` as a query parameter. */
function endpointOf(op: OperationDescriptor, args: OperationCallArgs): string {
  let path = op.path;
  for (const p of op.parameters) {
    if (p.in !== 'path') continue;
    const value = args[p.name];
    if (value === undefined || value === null || value === '') throw new Error(`"${op.id}" needs "${p.name}".`);
    path = path.replace(new RegExp(`:${p.name}(\\{[^}]*\\})?(?=/|$)`), encodeURIComponent(text(value)));
  }
  const pathNames = new Set(op.parameters.filter((p) => p.in === 'path').map((p) => p.name));
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(args)) {
    if (name === 'body' || pathNames.has(name) || value === undefined || value === null) continue;
    query.set(name, text(value));
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Call one Kortix API operation by id. Resolves to the response body. A call
 * a workspace rule holds for a person's approval resolves to
 * `{ status: 'pending_approval', execution_id, … }`: Kortix runs it once after
 * approval, so the caller does not repeat it. Throws on any other non-2xx
 * answer (the SDK's `ApiError`).
 */
export async function callOperation<T = unknown>(id: OperationId, args: OperationCallArgs = {}): Promise<T> {
  const op = operation(id);
  const endpoint = endpointOf(op, args);
  const options = { showErrors: false } as const;
  const response =
    op.method === 'GET'
      ? await backendApi.get<T>(endpoint, options)
      : op.method === 'DELETE'
        ? await backendApi.delete<T>(endpoint, {
            ...options,
            ...(args.body !== undefined ? ({ body: JSON.stringify(args.body), headers: { 'Content-Type': 'application/json' } } as object) : {}),
          })
        : op.method === 'PUT'
          ? await backendApi.put<T>(endpoint, args.body, options)
          : op.method === 'PATCH'
            ? await backendApi.patch<T>(endpoint, args.body, options)
            : await backendApi.post<T>(endpoint, args.body, options);
  if (!response.success) throw response.error ?? new Error(`"${op.id}" failed`);
  return response.data as T;
}
