import { HTTPException } from 'hono/http-exception';

/**
 * Per-account cap on cost reports running against the database at once
 * (`GET /v1/usage/session-costs`, `/v1/usage/cost-summary`,
 * `/v1/usage/cost-by-project`). Each is a grouping aggregation over gateway_request_logs that can run for the whole 25 s request
 * deadline, and the deadline answers the client without cancelling the query.
 * The slot is held until the query itself settles, so orphaned queries still
 * count and a retry storm cannot pile more of them onto the database
 * (2026-11-13 22:10 UTC: 156 calls in 15 min stalled every route, KRTX-4891).
 */
export const MAX_COST_REPORTS_PER_ACCOUNT = 2;
const RETRY_AFTER_SECONDS = 5;

// replica-local: the cap bounds the load one replica can put on the database, so
// each replica counting its own queries is the intended scope (3 replicas x 2).
const inFlight = new Map<string, number>();

export async function withCostReportSlot<T>(accountId: string, run: () => Promise<T>): Promise<T> {
  const running = inFlight.get(accountId) ?? 0;
  if (running >= MAX_COST_REPORTS_PER_ACCOUNT) {
    throw new HTTPException(429, {
      message: 'Too many cost reports are already running for this account',
      res: new Response(
        JSON.stringify({
          error: 'rate_limit_exceeded',
          code: 'cost_report_in_flight',
          message: 'Too many cost reports are already running for this account. Retry shortly.',
          retry_after_seconds: RETRY_AFTER_SECONDS,
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(RETRY_AFTER_SECONDS) },
        },
      ),
    });
  }
  inFlight.set(accountId, running + 1);
  try {
    return await run();
  } finally {
    const left = (inFlight.get(accountId) ?? 1) - 1;
    if (left <= 0) inFlight.delete(accountId);
    else inFlight.set(accountId, left);
  }
}
