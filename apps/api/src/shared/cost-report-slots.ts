import { HTTPException } from 'hono/http-exception';

/**
 * Per-replica cap on cost reports running against the database at once
 * (`GET /v1/usage/session-costs`, `/v1/usage/cost-summary`,
 * `/v1/usage/cost-by-project`). Each is a grouping aggregation over
 * gateway_request_logs that can run for the whole 25 s request deadline, and
 * the deadline answers the client without cancelling the query. A session-cost
 * report fans out to 4 parallel queries (listSessionCosts: rows, total,
 * reconciliation, plus the inner Promise.all) and the pool holds
 * DEFAULT_DB_POOL_MAX = 6 connections, so a second report would not fit: the cap
 * is 1 per replica, across all accounts. The slot is held until the query
 * itself settles, so orphaned queries still count and a retry storm cannot pile
 * more of them onto the database (2026-11-13 22:10 UTC: 156 calls in 15 min
 * stalled every route, KRTX-4891).
 */
export const MAX_COST_REPORTS_PER_REPLICA = 1;
const RETRY_AFTER_SECONDS = 5;

// replica-local: the cap bounds the pool one replica can lose to reports.
let inFlight = 0;

export async function withCostReportSlot<T>(run: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_COST_REPORTS_PER_REPLICA) {
    throw new HTTPException(429, {
      message: 'Too many cost reports are already running on this replica',
      res: new Response(
        JSON.stringify({
          error: 'rate_limit_exceeded',
          code: 'cost_report_in_flight',
          message: 'Too many cost reports are already running on this replica. Retry shortly.',
          retry_after_seconds: RETRY_AFTER_SECONDS,
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(RETRY_AFTER_SECONDS) },
        },
      ),
    });
  }
  inFlight++;
  try {
    return await run();
  } finally {
    inFlight--;
  }
}
