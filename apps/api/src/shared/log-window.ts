/**
 * Rate-limit a repeated log line by key: the first line in a window logs
 * immediately, later lines increment a best-effort `suppressed` count that the
 * next emitted line reports in its context. Throttle the LINE only, never the
 * behavior it describes, and keep the line text grouping verbatim — the count
 * rides the structured context. A ten-minute window permits six lines per key
 * per process per hour. Suppression counts are best-effort: they appear only
 * on the next emitted line. A final quiet burst, eviction or process restart
 * can lose pending counts; use a precise per-request source for exact
 * accounting.
 *
 * Users: the marked refusals of the global error handler
 * (shared/dead-credential-log.ts, KRTX-1039/4442/4454) and the drives
 * Platinum failure lines (drives/volumes.ts, KRTX-4672).
 */

const WINDOW_MS = 10 * 60_000;
const MAX_TRACKED_MESSAGES = 10_000;

type Window = { loggedAt: number; suppressed: number };
// replica-local: a log-noise limiter; each replica rate-limits its own lines.
const windows = new Map<string, Window>();

/** First warning logs immediately; the next window reports pending suppression. */
export function logWindowDecision(key: string, now: number): { log: boolean; suppressed: number } {
  const window = windows.get(key);
  if (window && now - window.loggedAt < WINDOW_MS) {
    window.suppressed += 1;
    return { log: false, suppressed: 0 };
  }
  const suppressed = window?.suppressed ?? 0;
  if (!window && windows.size >= MAX_TRACKED_MESSAGES) {
    const oldest = windows.keys().next().value;
    if (oldest !== undefined) windows.delete(oldest);
  }
  windows.set(key, { loggedAt: now, suppressed: 0 });
  return { log: true, suppressed };
}

/** Test seam. */
export function resetLogWindowsForTests(): void {
  windows.clear();
}
