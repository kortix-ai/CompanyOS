import type { Context, MiddlewareHandler } from 'hono';

// Caps how many requests of one caller may run a route at the same time.
//
// KRTX-4889: one account's dashboard retried `GET /v1/usage/session-costs`,
// `/cost-summary` and `/cost-by-project` (each 5–25 s of `gateway_request_logs`
// aggregation, several statements in parallel) after the 25 s request deadline
// 503'd it. The deadline only races the handler: the orphan keeps its pool
// connections until its statements finish, so every retry stacked more heavy
// queries on the shared pool and unrelated routes (log/journal, audit/events,
// session GET) died waiting for a connection.
//
// The slot is released in `finally`, i.e. when the handler REALLY settles, not
// when the deadline answers. A caller that retries while its earlier request is
// still running gets a fast, retryable 429 instead of another heavy query.
// Counters are per process; each API task bounds its own share of the pool.

/**
 * @param max concurrent requests allowed per key.
 * @param keyOf the caller identity; `null` skips the limit.
 */
export function inFlightLimit(
  max: number,
  keyOf: (c: Context) => string | null,
  retryAfterSeconds = 5,
): MiddlewareHandler {
  const active = new Map<string, number>();
  return async (c, next) => {
    const key = keyOf(c);
    if (key === null) return next();
    const running = active.get(key) ?? 0;
    if (running >= max) {
      return c.json(
        {
          error: 'too_many_in_flight',
          message: 'A previous request of yours for this resource is still running. Retry shortly.',
          retry_after_seconds: retryAfterSeconds,
        },
        429,
        { 'Retry-After': String(retryAfterSeconds) },
      );
    }
    active.set(key, running + 1);
    try {
      await next();
    } finally {
      const left = (active.get(key) ?? 1) - 1;
      if (left <= 0) active.delete(key);
      else active.set(key, left);
    }
  };
}
