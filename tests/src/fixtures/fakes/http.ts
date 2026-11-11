/**
 * The loopback HTTP server under every fake in this folder.
 *
 * `node:http` (or `node:https` with `tls`) so the same fake runs inside a bun
 * flow and inside a vitest unit test. The server binds 127.0.0.1 port 0 and
 * advertises `http://127.0.0.1:<port>`: the local stack exempts exactly that
 * host from the connector egress check (`KORTIX_CONNECTOR_EGRESS_ALLOW_HOSTS`).
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

/** One request a fake received, in arrival order. */
export interface RecordedRequest {
  method: string;
  /** Path without the query string. */
  path: string;
  /** Raw request target: path plus query string, as sent. */
  url: string;
  query: Record<string, string>;
  /** Lower-cased header names; repeated headers joined with ", ". */
  headers: Record<string, string>;
  /** Raw body as UTF-8 text ('' when none). */
  body: string;
}

export interface LoopbackTls {
  key: string | Buffer;
  cert: string | Buffer;
}

export interface LoopbackServer {
  /** `http(s)://127.0.0.1:<port>`, no trailing slash. */
  origin: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

export type LoopbackHandler = (req: RecordedRequest, res: ServerResponse) => void | Promise<void>;

function headerRecord(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export async function startLoopback(
  handler: LoopbackHandler,
  options: { tls?: LoopbackTls } = {},
): Promise<LoopbackServer> {
  const requests: RecordedRequest[] = [];
  const listener = (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = req.url ?? '/';
      const parsed = new URL(url, 'http://127.0.0.1');
      const recorded: RecordedRequest = {
        method: (req.method ?? 'GET').toUpperCase(),
        path: parsed.pathname,
        url,
        query: Object.fromEntries(parsed.searchParams),
        headers: headerRecord(req),
        body: await readBody(req),
      };
      requests.push(recorded);
      await handler(recorded, res);
    })().catch((error: unknown) => {
      if (!res.headersSent) sendJson(res, 500, { error: 'fake_error', error_description: String(error) });
      else res.end();
    });
  };
  const server = options.tls
    ? createHttpsServer({ key: options.tls.key, cert: options.tls.cert }, listener)
    : createHttpServer(listener);
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
  });
  return {
    origin: `${options.tls ? 'https' : 'http'}://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        // Keep-alive sockets would hold close() open until they time out.
        (server as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(text)),
    ...headers,
  });
  res.end(text);
}

/** `application/x-www-form-urlencoded` body → record. */
export function parseForm(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body));
}

/** JSON body → value, or undefined when the body is empty or not JSON. */
export function parseJson(body: string): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** The bearer token in an Authorization header, or null. */
export function bearerToken(headers: Record<string, string>): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(headers.authorization ?? '');
  return match ? match[1]!.trim() : null;
}
