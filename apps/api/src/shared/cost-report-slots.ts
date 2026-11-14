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
 * is 1 per replica, across all accounts. Reports beyond the cap wait in a FIFO
 * queue (the Cost Explorer fires up to ~27 at once and the web client never
 * retries a 4xx) and get a 429 only when the wait would pass
 * MAX_SLOT_WAIT_MS, below the 25 s request deadline. The slot is held until the query
 * itself settles, so orphaned queries still count and a retry storm cannot pile
 * more of them onto the database (2026-11-13 22:10 UTC: 156 calls in 15 min
 * stalled every route, KRTX-4891).
 */
export const MAX_COST_REPORTS_PER_REPLICA = 1;
export const MAX_SLOT_WAIT_MS = 15_000;
const RETRY_AFTER_SECONDS = 5;

// replica-local: the cap bounds the pool one replica can lose to reports.
let inFlight = 0;
const waiters: Array<() => void> = [];

function tooMany(): HTTPException {
  return new HTTPException(429, {
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

/** Resolves when a slot is ours (the slot is handed over, inFlight unchanged); rejects with a 429 after waitMs. */
function acquire(waitMs: number): Promise<void> {
  if (inFlight < MAX_COST_REPORTS_PER_REPLICA) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const grant = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      waiters.splice(waiters.indexOf(grant), 1);
      reject(tooMany());
    }, waitMs);
    waiters.push(grant);
  });
}

function release(): void {
  const next = waiters.shift();
  if (next) next();
  else inFlight--;
}

export async function withCostReportSlot<T>(run: () => Promise<T>, waitMs = MAX_SLOT_WAIT_MS): Promise<T> {
  await acquire(waitMs);
  try {
    return await run();
  } finally {
    release();
  }
}
