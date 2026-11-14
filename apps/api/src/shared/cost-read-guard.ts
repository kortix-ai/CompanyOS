import { HTTPException } from 'hono/http-exception';

// Allows one cost-explorer window scan at a time on this API process. Each of
// /v1/usage/session-costs, /cost-by-project and /cost-summary aggregates every
// gateway_request_logs row of its window and runs 4 to 6 statements in parallel
// (cost-rollups.ts), against a pool of DEFAULT_DB_POOL_MAX = 6 connections. A
// single read can therefore fill the pool, so the bound is per replica, not per
// account: a second read of any account waits for nothing and is refused. On
// 2026-11-13 one caller sent 149 session-costs reads in under six minutes; the
// SDK retried every 503 twice, the pool saturated and unrelated routes missed
// the 25 s request deadline (a 3 minute API-wide brownout).
//
// The permit is released when the read SETTLES, not when the request deadline
// answers 503: the deadline does not cancel the statements, so a permit freed
// at the 503 would let the pool fill with orphaned scans anyway.

export const COST_READ_CODE = 'cost_read_busy' as const;

const RETRY_AFTER_SECONDS = 5;

let running = false;

function busy(): HTTPException {
  const body = {
    error: 'rate_limit_exceeded',
    code: COST_READ_CODE,
    message: 'Another cost read is running on this server. Retry shortly.',
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

export async function withCostReadGuard<T>(read: () => Promise<T>): Promise<T> {
  if (running) throw busy();
  running = true;
  try {
    return await read();
  } finally {
    running = false;
  }
}
