import { HTTPException } from 'hono/http-exception';

// Caps how many window scans of the cost explorer one account runs at once on
// this API process. Each of /v1/usage/session-costs, /cost-by-project and
// /cost-summary aggregates every gateway_request_logs row of its window and
// holds up to six pool connections for as long as the scans run. On
// 2026-11-13 one caller sent 149 session-costs reads in under six minutes; the
// SDK retried every 503 twice, the pool saturated and unrelated routes missed
// the 25 s request deadline (a 3 minute API-wide brownout).
//
// The permit is released when the reads SETTLE, not when the request deadline
// answers 503: the deadline does not cancel the statements, so a slot freed at
// the 503 would let the pool fill with orphaned scans anyway.

export const COST_READ_CODE = 'cost_read_busy' as const;

export const COST_READ_MAX_IN_FLIGHT = 3;
const RETRY_AFTER_SECONDS = 5;

// replica-local: the cap bounds the pool connections THIS replica gives one
// account, and the pool it protects is replica-local too. Three replicas allow
// one account 3 x COST_READ_MAX_IN_FLIGHT reads, still far below pool size.
const inFlight = new Map<string, number>();

function busy(): HTTPException {
  const body = {
    error: 'rate_limit_exceeded',
    code: COST_READ_CODE,
    message: 'Too many cost reads are running for this account. Retry shortly.',
    retry_after_seconds: RETRY_AFTER_SECONDS,
  };
  return new HTTPException(429, {
    message: body.message,
    res: new Response(JSON.stringify(body), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(RETRY_AFTER_SECONDS) },
    }),
  });
}

export async function withCostReadGuard<T>(accountId: string, read: () => Promise<T>): Promise<T> {
  const running = inFlight.get(accountId) ?? 0;
  if (running >= COST_READ_MAX_IN_FLIGHT) throw busy();
  inFlight.set(accountId, running + 1);
  try {
    return await read();
  } finally {
    const left = (inFlight.get(accountId) ?? 1) - 1;
    if (left > 0) inFlight.set(accountId, left);
    else inFlight.delete(accountId);
  }
}
