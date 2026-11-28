/**
 * Running an API operation inside this process, as a given caller: the
 * `kortix` connector's calls (`connectors/kortix-agent/kortix.ts`).
 *
 * The caller rides on the request's `env` under a module-private symbol. An
 * HTTP request never has it: Bun hands `fetch` its server object as `env`,
 * and no client input can create this symbol. The auth middleware reads it
 * before any header (`middleware/auth-in-process.ts`).
 *
 * The gateway names the caller to the in-process server in a signed header
 * (`x-kortix-caller`), so a header a kortix.yaml connector configures cannot
 * name another caller.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { config } from '../config';

const CALLER = Symbol('kortix.in-process-caller');

export const KORTIX_CALLER_HEADER = 'x-kortix-caller';

/** How long a signed caller header is good for: one gateway request. */
const CALLER_TTL_MS = 5 * 60_000;

export interface InProcessCaller {
  /** The account token the call acts as (an agent session's, a person's CLI key). */
  tokenId: string;
  sessionId: string | null;
  /** The held call a person approved, when this is its run: lets a HUMAN_ONLY action through. */
  approvedExecutionId?: string | null;
}

type Executor = (request: Request, env: Record<symbol, unknown>) => Promise<Response>;
// replica-local: the app's own fetch, installed once by app.ts at boot.
let executor: Executor | null = null;

/** Called once by `app.ts`, after every route is mounted. */
export function installOperationExecutor(fn: Executor): void {
  executor = fn;
}

/** Run `request` through this API as `caller`. Its auth is the caller's token, its agent rules decided already. */
export async function runInProcess(request: Request, caller: InProcessCaller): Promise<Response> {
  if (!executor) throw new Error('the operation executor is not installed');
  return executor(request, { [CALLER]: caller });
}

/** The in-process caller of this request, or null for every HTTP request. */
export function inProcessCaller(c: Context): InProcessCaller | null {
  const env = c.env as Record<symbol, unknown> | undefined;
  if (!env || typeof env !== 'object') return null;
  const caller = env[CALLER];
  return caller && typeof caller === 'object' ? (caller as InProcessCaller) : null;
}

const mac = (payload: string) => createHmac('sha256', `kortix-caller:${config.API_KEY_SECRET}`).update(payload).digest('base64url');

/** `<token id>.<session id or ->.<approved execution id or ->.<expiry ms>.<mac>` for `x-kortix-caller`. */
export function signCaller(caller: InProcessCaller, now = Date.now()): string {
  const payload = `${caller.tokenId}.${caller.sessionId ?? '-'}.${caller.approvedExecutionId ?? '-'}.${now + CALLER_TTL_MS}`;
  return `${payload}.${mac(payload)}`;
}

/** The caller a signed header names, or null when it is absent, forged or expired. */
export function verifyCaller(header: string | null | undefined, now = Date.now()): InProcessCaller | null {
  if (!header) return null;
  const parts = header.split('.');
  if (parts.length !== 5) return null;
  const [tokenId, session, approved, expiry, signature] = parts as [string, string, string, string, string];
  const expected = Buffer.from(mac(`${tokenId}.${session}.${approved}.${expiry}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!(Number(expiry) > now)) return null;
  return { tokenId, sessionId: session === '-' ? null : session, approvedExecutionId: approved === '-' ? null : approved };
}
