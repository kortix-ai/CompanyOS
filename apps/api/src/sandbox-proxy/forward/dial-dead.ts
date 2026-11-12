/**
 * The dial-dead mark: a box whose HTTP path PROVED dead stops being dialled by
 * every request after the mark confirms (KRTX-4459).
 *
 * The prod shape that forced this: a session box's daemon died on a running
 * box, every proxied fetch to it timed out at the proxy's 15 s connect timer,
 * and the client kept polling (`/kortix/runtime/pending` reads in ~7-request
 * bursts every ~2-3 min). Each poll walked the whole auto-wake ladder — 4
 * attempts × 15 s + delays ≈ the full 50 s budget — before the give-up 502, so
 * ~5% of a small hour's rows read 45-50 s and the route's p95 read 15-45 s
 * (its p50 stayed at ~90 ms).
 *
 * Two review findings shaped what may mark a port:
 *
 * • The proxy's connect timer bounds the connect AND header phase, so a
 *   healthy-but-slow handler (a busy box answering headers in >15 s) produces
 *   the same TimeoutError as a dead dial. Marking on the timer alone would
 *   poison the port (review finding on the first cut, 2026-11-11).
 * • The ingress is an HTTPS provider edge that accepts TCP whatever the box
 *   behind it is doing, so a TCP connect proves nothing about the box (review
 *   finding on the second cut, 2026-11-11). The candidate streak only ever
 *   forms on header timeouts — a connection refusal never enters it — so a
 *   TCP probe of exactly the cases the streak holds is always "reachable".
 *
 * So a streak of two timeouts is only a CANDIDATE, and the mark confirms when
 * a bounded HTTP probe through the ingress — the same URL and auth headers a
 * real attempt sends — also gets no answer. The HTTP response is the one
 * observable the edge passes through from the box: any response (any status,
 * even the edge's own fast error) proves the path answers and clears the
 * streak; nothing within the probe budget proves the path answers no request,
 * which is the dead-box shape. The budget is longer than one attempt timer so
 * a handler that answers late is served by the probe even though the attempts
 * timed out.
 *
 * The probe runs DETACHED from the request: the confirming request keeps
 * today's ladder and its give-up, the probe settles on its own budget, and the
 * NEXT request fast-fails. One probe per key at a time: a concurrent burst
 * awaiting confirmation shares the first caller's probe instead of dialling
 * the box N times.
 *
 * After confirmation:
 *   • every request fast-fails (give-up 502, zero dials) — no wake either;
 *     liveness stays owned by the wake the failing attempt already fired,
 *     the relaunch flow and the reaper;
 *   • one request per probe window dials again, so a box the relaunch revived
 *     is served again within the window (its own successful answer clears the
 *     mark);
 *   • the re-probe dial timing out does NOT un-confirm: the box just proved
 *     dead again, so the mark stays and the window holds.
 *
 * Writes are exempt: a prompt delivery or upload keeps today's ladder and its
 * ambiguity guards. Connection-refused and fast edge 502/503 answers (a booting
 * box) never throw, so they never mark — the short-delay ladder for those is
 * untouched.
 */

/** Timeouts inside this window count toward the candidate streak; a timeout
 *  older than this starts a new streak (a box that dials fine for 5 min is not
 *  the box that timed out). */
export const DIAL_DEAD_STREAK_WINDOW_MS = 5 * 60 * 1000;

/** Consecutive connect timeouts that make a box a dial-dead candidate. One is
 *  the stale-ingress case the ladder already recovers from; two in a row ask
 *  for the HTTP probe. */
export const DIAL_DEAD_AFTER_TIMEOUTS = 2;

/** How long a confirmed mark holds before ONE request may dial again. Longer
 *  than a client poll burst (the observed dead-box cadence is a burst every
 *  ~2-3 min), far shorter than a tab's lifetime. */
export const DIAL_DEAD_PROBE_SPACING_MS = 2 * 60 * 1000;

/** The HTTP probe's budget: longer than one attempt timer
 *  (`PROXY_ATTEMPT_TIMEOUT_MS`, 15 s) so a handler that answers late is served
 *  by the probe; a path that answers nothing within it is dial-dead. */
export const DIAL_PROBE_TIMEOUT_MS = 30_000;

/** Registry bound — marks are per sandbox:port, so this is far above any
 *  honest concurrent-sandbox count and exists only as a leak backstop. */
const MAX_TRACKED = 1_000;

/** The probe request: the exact URL and auth headers a real attempt sends.
 *  Without the auth headers the private edge refuses fast on its own and the
 *  answer would prove only the edge, never the box. */
export interface DialProbeTarget {
  url: string;
  headers: Record<string, string>;
}

interface DialDead {
  /** Consecutive connect timeouts inside the streak window. */
  timeouts: number;
  /** When the last timeout was seen (streak freshness + prune age). */
  lastAtMs: number;
  /** True once the HTTP probe found no answer for the candidate. */
  confirmed: boolean;
  /** Earliest instant a request may dial again (the probe slot). */
  probeAtMs: number;
}

// replica-local: a mark only makes one replica fail fast while the others
// still dial (today's behavior, bounded); a cleared mark on one replica costs
// the others one probe window. No correctness depends on cross-replica
// agreement, so this process's copy is its own source of truth.
const dialDeadMarks = new Map<string, DialDead>();

// replica-local: a shared probe only dedupes a burst within one replica; the
// other replicas' bursts dial the box once more, bounded by the ladder.
const probesInFlight = new Map<string, Promise<void>>();

/** The probe budget a test may shorten; the production value is the constant. */
let probeBudgetMs = DIAL_PROBE_TIMEOUT_MS;

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
 *  makes the box a candidate; only the HTTP probe confirms it. A timeout of an
 *  already-confirmed box does not un-confirm it: the box just proved dead
 *  again, so the mark and its probe window hold. */
export function recordDialTimeout(key: string, nowMs = Date.now()): void {
  const previous = dialDeadMarks.get(key);
  const fresh = !previous || nowMs - previous.lastAtMs > DIAL_DEAD_STREAK_WINDOW_MS;
  const confirmed = !fresh && previous.confirmed;
  dialDeadMarks.set(key, {
    timeouts: (fresh ? 0 : previous.timeouts) + 1,
    lastAtMs: nowMs,
    confirmed,
    probeAtMs: confirmed ? previous.probeAtMs : 0,
  });
  pruneIfNeeded(nowMs);
}

/** A dial reached the box (any answer, even an error status): the path is
 *  proven and the mark is obsolete. */
export function clearDialDead(key: string): void {
  dialDeadMarks.delete(key);
  probesInFlight.delete(key);
}

/** Is `key` an unconfirmed candidate — two consecutive connect timeouts, the
 *  HTTP probe not settled yet? The request ladder stops on it (a third dial
 *  against a box that timed out twice buys another 15 s hang) but no request
 *  skips a dial until the probe confirms the mark: a slow handler keeps being
 *  dialled until the probe proves it answers. */
export function isDialDeadCandidate(key: string): boolean {
  const mark = dialDeadMarks.get(key);
  return !!mark && !mark.confirmed && mark.timeouts >= DIAL_DEAD_AFTER_TIMEOUTS;
}

/** Should this request skip the dial? True only for a CONFIRMED mark inside
 *  its fast-fail window. An expired window hands out the re-probe slot
 *  (renewed synchronously, so of a concurrent burst only the first caller
 *  re-probes). */
export function shouldFailFast(key: string, nowMs = Date.now()): boolean {
  const mark = dialDeadMarks.get(key);
  if (!mark || !mark.confirmed) return false;
  if (nowMs < mark.probeAtMs) return true;
  mark.probeAtMs = nowMs + DIAL_DEAD_PROBE_SPACING_MS;
  return false;
}

/** If `key` holds an unconfirmed candidate (two timeouts, no probe verdict
 *  yet), fire ONE detached HTTP probe through the ingress and confirm or clear
 *  the mark when it settles. Concurrent callers share the in-flight probe;
 *  awaiting the returned promise waits for its verdict (the request path
 *  discards it — `void`). `probeSettledAtMs` stamps the confirmed mark's probe
 *  window; the request path leaves the default (the settle instant). */
export function maybeProbeDialDeadCandidate(
  key: string,
  target: DialProbeTarget,
  probeSettledAtMs = Date.now(),
): Promise<void> {
  const inFlight = probesInFlight.get(key);
  if (inFlight) return inFlight;
  if (!isDialDeadCandidate(key)) return Promise.resolve();
  const probe = probeTarget(target)
    .then((answered) => {
      // A concurrent dial may have answered while the probe ran — a success
      // outranks the probe, so never re-mark a cleared key.
      const current = dialDeadMarks.get(key);
      if (!current || current.confirmed) return;
      if (answered) {
        dialDeadMarks.delete(key);
        return;
      }
      current.confirmed = true;
      current.probeAtMs = probeSettledAtMs + DIAL_DEAD_PROBE_SPACING_MS;
    })
    .catch(() => {})
    .finally(() => {
      if (probesInFlight.get(key) === probe) probesInFlight.delete(key);
    });
  probesInFlight.set(key, probe);
  return probe;
}

/** The real probe: one bounded GET through the ingress. The request goes out
 *  with the attempt's auth headers, so a settled response (any status, even
 *  the edge's own error) comes from the path the attempts failed on. Anything
 *  else — a refusal, an abort at the budget, no headers — is "no answer". */
export let probeTarget: (target: DialProbeTarget) => Promise<boolean> = async (target) => {
  try {
    const response = await fetch(target.url, {
      method: 'GET',
      headers: target.headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(probeBudgetMs),
    });
    void response.body?.cancel().catch(() => {});
    return true;
  } catch {
    return false;
  }
};

/** The probe implementation a test stub replaces; `null` restores this one. */
let defaultProbeTarget = probeTarget;

/** Test-only: replace the HTTP probe (unit tests and the mocked e2e harness
 *  must not dial the real network; `null` restores the real probe). */
export function __setDialProbeForTests(
  probe: ((target: DialProbeTarget) => Promise<boolean>) | null,
): void {
  probeTarget = probe ?? defaultProbeTarget;
}

/** Test-only: shorten the real probe's budget for the real-topology tests
 *  (a 30 s wait has no place in a unit suite). */
export function __setDialProbeBudgetForTests(ms: number): void {
  probeBudgetMs = ms;
}

/** Test-only: drop every mark and in-flight probe, and restore the real probe
 *  and budget. */
export function __resetDialDeadForTests(): void {
  dialDeadMarks.clear();
  probesInFlight.clear();
  probeTarget = defaultProbeTarget;
  probeBudgetMs = DIAL_PROBE_TIMEOUT_MS;
}
