/**
 * A loopback HTTP API for connector flows: an OpenAPI 3 document plus echo
 * endpoints.
 *
 * - `GET <specPath>` (default `/openapi.json`) serves the spec, never behind
 *   auth. The default spec has `servers[0].url` = this origin and three
 *   operations: `GET /echo`, `POST /echo`, `GET /items/{id}`.
 * - Every other request is echoed as JSON:
 *   `{ method, path, url, query, headers, body }`, where `body` is the parsed
 *   JSON body, or the raw text when it is not JSON.
 * - `routes` overrides the answer for `'METHOD /path'` keys.
 * - `auth` checks a bearer on every non-spec request (see `bearer-auth.ts`).
 *
 * `requests` records everything, spec reads included; `echoed()` only the
 * requests that reached the API surface.
 */
import type { ServerResponse } from 'node:http';
import { type BearerAuth, checkBearer, protectedResourceMetadata, protectedResourceMetadataPath } from './bearer-auth';
import { type LoopbackTls, type RecordedRequest, parseJson, sendJson, startLoopback } from './http';

export type UpstreamRoute = (req: RecordedRequest, res: ServerResponse) => void | Promise<void>;

export interface OpenApiUpstreamOptions {
  /** The document, or a builder that receives this server's origin. */
  spec?: Record<string, unknown> | ((origin: string) => Record<string, unknown>);
  specPath?: string;
  title?: string;
  auth?: BearerAuth;
  /** Exact `'METHOD /path'` handlers, checked before the echo. */
  routes?: Record<string, UpstreamRoute>;
  tls?: LoopbackTls;
}

export interface FakeOpenApiUpstream {
  url: string;
  origin: string;
  specUrl: string;
  spec: Record<string, unknown>;
  requests: RecordedRequest[];
  /** Requests other than spec and metadata reads. */
  echoed(): RecordedRequest[];
  lastRequest(): RecordedRequest | undefined;
  close(): Promise<void>;
}

export function defaultOpenApiSpec(origin: string, title = 'KE2E Upstream'): Record<string, unknown> {
  const echo = { description: 'The request, echoed', content: { 'application/json': { schema: { type: 'object' } } } };
  return {
    openapi: '3.0.3',
    info: { title, version: '1.0.0' },
    servers: [{ url: origin }],
    paths: {
      '/echo': {
        get: {
          operationId: 'echoGet',
          summary: 'Echo a GET request',
          parameters: [{ name: 'q', in: 'query', required: false, schema: { type: 'string' } }],
          responses: { '200': echo },
        },
        post: {
          operationId: 'echoPost',
          summary: 'Echo a POST request',
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { '200': echo },
        },
      },
      '/items/{id}': {
        get: {
          operationId: 'getItem',
          summary: 'Read one item',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': echo },
        },
      },
    },
  };
}

export async function startOpenApiUpstream(options: OpenApiUpstreamOptions = {}): Promise<FakeOpenApiUpstream> {
  const specPath = options.specPath ?? '/openapi.json';
  const metadataPath = protectedResourceMetadataPath('/');
  let origin = '';
  let spec: Record<string, unknown> = {};
  const isMeta = (r: RecordedRequest) => r.method === 'GET' && (r.path === specPath || r.path === metadataPath);

  const server = await startLoopback(
    async (req, res) => {
      if (req.method === 'GET' && req.path === specPath) return sendJson(res, 200, spec);
      if (req.method === 'GET' && req.path === metadataPath && options.auth && 'issuer' in options.auth) {
        return sendJson(res, 200, protectedResourceMetadata(options.auth, origin));
      }
      if (!checkBearer(options.auth, req, res, `${origin}${metadataPath}`)) return;
      const route = options.routes?.[`${req.method} ${req.path}`];
      if (route) return route(req, res);
      sendJson(res, 200, {
        method: req.method,
        path: req.path,
        url: req.url,
        query: req.query,
        headers: req.headers,
        body: parseJson(req.body) ?? req.body,
      });
    },
    { tls: options.tls },
  );
  origin = server.origin;
  spec =
    typeof options.spec === 'function'
      ? options.spec(origin)
      : (options.spec ?? defaultOpenApiSpec(origin, options.title));

  return {
    url: origin,
    origin,
    specUrl: `${origin}${specPath}`,
    spec,
    requests: server.requests,
    echoed: () => server.requests.filter((r) => !isMeta(r)),
    lastRequest: () => server.requests.at(-1),
    close: server.close,
  };
}
