/**
 * The dial-dead mark: a box whose TCP dials keep timing out stops being
 * dialled by every request after the second consecutive timeout (KRTX-4459).
 *
 * The prod shape that forced this: a session box's daemon died on a running
 * box, every TCP connect to it hung until the proxy's 15 s connect timer
 * fired, and the client kept polling (`/kortix/runtime/pending` reads in
 * ~7-request bursts every ~2-3 min). Each poll walked the whole auto-wake
 * ladder — 4 attempts × 15 s + delays ≈ the full 50 s budget — before the
 * give-up 502, so ~5% of a small hour's rows read 45-50 s and the route's p95
 * read 15-45 s (its p50 stayed at ~90 ms). One reoccurrence of the same
 * family put `GET /kortix/runtime/pending`'s p95 at 15849 ms against a 594 ms
 * baseline.
 *
 * Two consecutive connect timeouts prove the box dial-dead; ONE does not —
 * a stale cached ingress address (the box moved, the cache points at the old
 * one) times out exactly once and the ladder's next attempt re-resolves and
 * recovers, so the first timeout must never mark. After the mark:
 *
 *   • every request fast-fails (give-up 502, zero dials) — no wake either;
 *     liveness stays owned by the wake the failing attempt already fired,
 *     the relaunch flow and the reaper;
 *   • one request per probe window dials again, so a box the relaunch
 *     revived is served again within the window (its own successful answer
 *     clears the mark).
 *
 * Writes are exempt: a prompt delivery or upload keeps today's ladder and its
 * ambiguity guards. Connection-refused and fast edge 502/503 answers (a
 * booting box) never throw, so they never mark — the short-delay ladder for
 * those is untouched.
 */

/** Timeouts inside this window count toward the dead streak; a timeout older
 *  than this starts a new streak (a box that dials fine for 5 min is not the
 *  box that timed out). */
export const DIAL_DEAD_STREAK_WINDOW_MS = 5 * 60 * 1000;

/** Consecutive connect timeouts that prove a box dial-dead. One is the
 *  stale-ingress case the ladder already recovers from; two in a row are not. */
export const DIAL_DEAD_AFTER_TIMEOUTS = 2;

/** How long a fast-fail mark holds before ONE request may dial again. Longer
 *  than a client poll burst (the observed dead-box cadence is a burst every
 *  ~2-3 min), far shorter than a tab's lifetime. */
export const DIAL_DEAD_PROBE_SPACING_MS = 2 * 60 * 1000;

/** Registry bound — marks are per sandbox:port, so this is far above any
 *  honest concurrent-sandbox count and exists only as a leak backstop. */
const MAX_TRACKED = 1_000;

interface DialDead {
  /** Consecutive connect timeouts inside the streak window. */
  timeouts: number;
  /** When the last timeout was seen (streak freshness + prune age). */
  lastAtMs: number;
  /** Earliest instant a request may dial again (the probe slot). */
  probeAtMs: number;
}

// replica-local: a mark only makes one replica fail fast while the others
// still dial (today's behavior, bounded); a cleared mark on one replica costs
// the others one probe window. No correctness depends on cross-replica
// agreement, so this process's copy is its own source of truth.
const dialDeadMarks = new Map<string, DialDead>();

function pruneIfNeeded(nowMs: number): void {
  if (dialDeadMarks.size <= MAX_TRACKED) return;
  for (const [key, mark] of dialDeadMarks) {
    if (nowMs - mark.lastAtMs > DIAL_DEAD_STREAK_WINDOW_MS && nowMs - mark.probeAtMs > DIAL_DEAD_STREAK_WINDOW_MS) {
      dialDeadMarks.delete(key);
    }
    if (dialDeadMarks.size <= MAX_TRACKED) return;
  }
}

/** The registry key for one box port — the same key the SSE-stall mark uses. */
export function dialDeadKey(sandboxId: string, port: number): string {
  return `${sandboxId}:${port}`;
}

/** Record one connect timeout for `key`. The second inside the streak window
 *  marks the box dial-dead; every timeout renews the probe slot. */
export function recordDialTimeout(key: string, nowMs = Date.now()): void {
  const previous = dialDeadMarks.get(key);
  const streak = previous && nowMs - previous.lastAtMs <= DIAL_DEAD_STREAK_WINDOW_MS ? previous.timeouts : 0;
  dialDeadMarks.set(key, { timeouts: streak + 1, lastAtMs: nowMs, probeAtMs: nowMs + DIAL_DEAD_PROBE_SPACING_MS });
  pruneIfNeeded(nowMs);
}

/** A dial reached the box (any answer, even an error status): the path is
 *  proven and the mark is obsolete. */
export function clearDialDead(key: string): void {
  dialDeadMarks.delete(key);
}

/** Should this request skip the dial? True = dial-dead, fail fast. False for
 *  an unmarked box, a one-timeout streak, or — exactly once per probe window
 *  — the request that re-probes (the slot renews synchronously, so of a
 *  concurrent burst only the first caller probes). */
export function shouldFailFast(key: string, nowMs = Date.now()): boolean {
  const mark = dialDeadMarks.get(key);
  if (!mark || mark.timeouts < DIAL_DEAD_AFTER_TIMEOUTS) return false;
  if (nowMs < mark.probeAtMs) return true;
  mark.probeAtMs = nowMs + DIAL_DEAD_PROBE_SPACING_MS;
  return false;
}

/** Test-only: drop every mark. */
export function __resetDialDeadForTests(): void {
  dialDeadMarks.clear();
}
