import { createHash } from 'node:crypto';
import { gatewayErrorResponse } from '@kortix/llm-gateway';
import { TokenBucketRateLimiter } from '@kortix/shared/rate-limit';

/**
 * The per-credential request limit on every model route of this service. It
 * runs before the body is read and before the admit call to the API.
 *
 * Sandboxes can call this service directly (`LLM_GATEWAY_BASE_URL` on the
 * API). Their requests then skip the API's `/v1/llm` limit. This applies the
 * same limit under the same setting, `KORTIX_LLM_GATEWAY_REQS_PER_MIN`
 * (default 600 per minute per credential).
 *
 * The limit runs before `authenticate()`, so it cannot tell a real credential
 * from a fabricated one. A credential the API has answered with a principal is
 * real and keeps its own bucket, keyed on the credential's SHA-256 so no raw
 * secret stays in memory. Every other credential is charged to ONE shared
 * bucket, given by `unvalidatedPerMinute` (order of magnitude above one
 * credential's own budget), whatever its value: a caller that sends a fresh
 * made-up bearer per request cannot buy a private bucket each time, so the
 * shared allowance bounds how many requests reach the API unverified (CWE-770)
 * and the bucket map cannot grow one entry per request. `validated(credential)`
 * moves a real credential onto its own budget and gives back the shared slot it
 * took, once, so real traffic does not drain the allowance every new credential
 * shares. A request without a credential is not counted: the pipeline refuses
 * it with 401 before it calls the API. The cost this accepts: a credential's
 * first request spends a shared slot, refunded when the API validates it, so a
 * flood large enough to spend the whole shared allowance can refuse a real
 * credential still waiting on that first validation until the window refills.
 * That is the trade for a bounded, unauthenticated allowance.

 *
 * Each gateway task counts alone, so the fleet allows limit × tasks. This
 * stops a runaway loop or a flood on one credential. It is not a quota.
 *
 * Returns the 429 response, or null when the request may continue.
 */
export function createTokenRateLimit(
  limitPerMinute: number,
  unvalidatedPerMinute = limitPerMinute,
): {
  /** The limit for one request, charged to the credential's own bucket once validated, else to the shared one. */
  (request: Request, headers?: Headers): Response | null;
  /** The API answered this credential with a principal; it keeps its own bucket from now on. */
  validated: (credential: string) => void;
  /** The live bucket keys; KRTX-4528 proves a flood of fakes leaves only the shared one. */
  buckets: () => string[];
} {
  const limiter = new TokenBucketRateLimiter('gateway_token');
  const validatedKeys = new Set<string>();
  // Credentials charged to the shared bucket while unvalidated; their slot is
  // refunded once, when the API validates them. Bounded by the shared
  // allowance itself: only an admitted request adds a key, and the bucket
  // admits at most `limit` of them per window, so the set cannot outgrow it.
  const chargedShared = new Set<string>();
  const policy = { limit: limitPerMinute, windowMs: 60_000 };
  const sharedPolicy = { limit: Math.max(1, unvalidatedPerMinute), windowMs: 60_000 };
  const limit = (request: Request, headers = new Headers()): Response | null => {
    const credential = credentialOf(request);
    if (!credential) return null;
    const key = hashOf(credential);
    // A validated credential keeps its own budget; anything else shares one
    // bucket, so a rotating fake bearer spends the shared allowance, never its
    // own private one.
    const result = limiter.check(
      validatedKeys.has(key) ? key : UNVALIDATED,
      validatedKeys.has(key) ? policy : sharedPolicy,
    );
    if (!validatedKeys.has(key) && result.allowed) chargedShared.add(key);
    headers.set('RateLimit-Limit', String(result.limit));
    headers.set('RateLimit-Remaining', String(result.remaining));
    headers.set('RateLimit-Reset', String(Math.ceil(result.resetMs / 1000)));
    if (result.allowed) return null;
    // A refusal must also stop the upload: an unread body is still buffered.
    request.body?.cancel().catch(() => {});
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.retryAfterMs ?? result.resetMs) / 1000),
    );
    const response = rateLimitedResponse(new URL(request.url).pathname, retryAfterSeconds);
    headers.forEach((value, name) => response.headers.set(name, value));
    return response;
  };
  limit.validated = (credential: string) => {
    const key = hashOf(credential);
    validatedKeys.add(key);
    // Give back the shared slot this credential's pre-validation request took,
    // once: it now has its own budget to be counted against.
    if (chargedShared.delete(key)) limiter.refund(UNVALIDATED, sharedPolicy);
  };
  limit.buckets = () => limiter.keys();
  return limit;
}

/** The bucket every credential this task has not validated shares. */
const UNVALIDATED = 'distinct_credentials';

/** The bearer token, or the `x-api-key` that Anthropic SDKs send instead. */
function credentialOf(request: Request): string | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec((request.headers.get('authorization') ?? '').trim())?.[1];
  return bearer || request.headers.get('x-api-key')?.trim() || null;
}

function hashOf(credential: string): string {
  return createHash('sha256').update(credential).digest('hex');
}

const MESSAGE = 'Too many requests for this credential. Retry shortly.';

/** A 429 in the envelope of the route's protocol: Anthropic for Messages and Claude Code, OpenAI otherwise. */
function rateLimitedResponse(path: string, retryAfterSeconds: number): Response {
  if (path.endsWith('/messages') || path.includes('/claude-code/')) {
    return new Response(
      JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: MESSAGE } }),
      {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': String(retryAfterSeconds) },
      },
    );
  }
  return gatewayErrorResponse(429, {
    message: MESSAGE,
    code: 'rate_limited',
    provider: '',
    requestedModel: '',
    resolvedModel: '',
    requestId: '',
    suggestion: 'Slow down. The limit is per credential per minute.',
    retryAfterSeconds,
  });
}
