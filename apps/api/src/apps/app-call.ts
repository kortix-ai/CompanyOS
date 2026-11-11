/**
 * Kortix calls an App of the project: a trigger whose target is an App
 * (`target: { app, path }`) and a tool the App exposes (`apps.<slug>.tools`,
 * connectors/app-tools.ts). Wake the App and send the request straight to a
 * serving machine, the path a public request takes after the access gate.
 * Only Kortix reaches a machine there, so a private App receives the call too.
 */
import { apps } from '@kortix/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { SandboxProviderName } from '../config';
import { db } from '../shared/db';
import { ingressTargetUrl } from '../platform/providers/ingress-url';
import { AppHostingProvider } from './hosting';
import { recordAppActivity } from './public-proxy-handler';
import { ensureAppRuntimeRunning, loadPublicApp } from './public-proxy-runtime';

const CALL_TIMEOUT_MS = 60_000;

export interface AppCallResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  /** A later attempt can succeed: no answer, a 429 or a 5xx. */
  retryable: boolean;
  /** The App's answer, only when the call asked for it (`readBody`). */
  body?: { text: string; contentType: string | null };
}

/** The App's answer is larger than the caller's `readBody.maxBytes`. */
export class AppResponseTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`upstream_response_too_large: the App answered more than ${maxBytes} bytes`);
    this.name = 'AppResponseTooLargeError';
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new AppResponseTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function callAppTarget(input: {
  projectId: string;
  app: string;
  method: string;
  path: string;
  /** Sent as the JSON body of a POST. Ignored when `body` is given. */
  payload?: Record<string, unknown>;
  /** A prepared request body (its `content-type` is in `headers`), for any method. */
  body?: string;
  headers: Record<string, string>;
  /** Read the App's answer, up to `maxBytes`, instead of discarding it. */
  readBody?: { maxBytes: number };
  /** Aborts the call earlier than the 60 s call timeout. */
  signal?: AbortSignal;
  hosting?: AppHostingProvider;
}): Promise<AppCallResult> {
  const hosting = input.hosting ?? new AppHostingProvider();
  const [row] = await db.select({ routeKey: apps.routeKey }).from(apps)
    .where(and(eq(apps.projectId, input.projectId), eq(apps.slug, input.app), isNull(apps.deletedAt))).limit(1);
  if (!row) return { ok: false, status: null, error: `No App "${input.app}" in this project`, retryable: false };
  const loaded = await loadPublicApp(row.routeKey, 'http');
  if (!loaded) return { ok: false, status: null, error: `App "${input.app}" has no ready release that serves http`, retryable: true };
  try {
    const runtime = await ensureAppRuntimeRunning(loaded, hosting);
    // A call is activity, like a request: the idle reaper waits for it.
    await recordAppActivity(loaded.app, runtime.runtimeId, new Date());
    const ingress = await hosting.ingress(runtime.provider as SandboxProviderName, runtime.externalId, 'http');
    const jsonPayload = input.body === undefined && input.method === 'POST';
    const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
    const response = await fetch(ingressTargetUrl(ingress, input.path), {
      method: input.method,
      headers: { ...ingress.headers, ...input.headers, ...(jsonPayload ? { 'content-type': 'application/json' } : {}) },
      body: input.body ?? (jsonPayload ? JSON.stringify(input.payload ?? {}) : undefined),
      signal: input.signal ? AbortSignal.any([timeout, input.signal]) : timeout,
      // The App's own server answers this call: a 3xx must not steer it, and the
      // provider token it carries, at another host (public-proxy-handler does the same).
      redirect: 'manual',
    });
    const body = input.readBody
      ? { text: await readBounded(response, input.readBody.maxBytes), contentType: response.headers.get('content-type') }
      : undefined;
    if (!body) await response.body?.cancel().catch(() => {});
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : `App "${input.app}" answered ${response.status} on ${input.method} ${input.path}`,
      retryable: response.status === 429 || response.status >= 500,
      ...(body ? { body } : {}),
    };
  } catch (error) {
    if (error instanceof AppResponseTooLargeError) throw error;
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error), retryable: true };
  }
}
