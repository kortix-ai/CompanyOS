/**
 * The dial-dead mark: a box that PROVED dial-dead at the TCP layer stops being
 * dialled by every request after the mark confirms (KRTX-4459).
 *
 * The prod shape that forced this: a session box's daemon died on a running
 * box, every TCP connect to it hung until the proxy's 15 s connect timer fired,
 * and the client kept polling (`/kortix/runtime/pending` reads in ~7-request
 * bursts every ~2-3 min). Each poll walked the whole auto-wake ladder — 4
 * attempts × 15 s + delays ≈ the full 50 s budget — before the give-up 502, so
 * ~5% of a small hour's rows read 45-50 s and the route's p95 read 15-45 s
 * (its p50 stayed at ~90 ms).
 *
 * The proxy's connect timer bounds the connect AND header phase, so a
 * healthy-but-slow handler (a busy box answering headers in >15 s) produces the
 * same TimeoutError as a dead dial. Marking on the timer alone would poison the
 * port: the next healthy sibling request would fail fast with zero dials
 * (review finding on the first cut, 2026-11-11). So a streak of two timeouts is
 * only a CANDIDATE: the mark confirms when a direct TCP connect probe to the
 * box's ingress address also fails. The probe is the one mechanism that
 * distinguishes the phases — a TCP layer that accepts a connection is not
 * dial-dead, whatever its handler is doing; a TCP layer that refuses or drops
 * the probe is.
 *
 * After confirmation:
 *   • every request fast-fails (give-up 502, zero dials) — no wake either;
 *     liveness stays owned by the wake the failing attempt already fired,
 *     the relaunch flow and the reaper;
 *   • one request per probe window dials again, so a box the relaunch revived
 *     is served again within the window (its own successful answer clears the
 *     mark).
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
 *  for the TCP probe. */
export const DIAL_DEAD_AFTER_TIMEOUTS = 2;

/** How long a confirmed mark holds before ONE request may dial again. Longer
 *  than a client poll burst (the observed dead-box cadence is a burst every
 *  ~2-3 min), far shorter than a tab's lifetime. */
export const DIAL_DEAD_PROBE_SPACING_MS = 2 * 60 * 1000;

/** The TCP connect probe's budget. A dead microVM usually refuses in
 *  milliseconds; a black-holed SYN needs the cap. */
export const DIAL_PROBE_TIMEOUT_MS = 5_000;

/** Registry bound — marks are per sandbox:port, so this is far above any
 *  honest concurrent-sandbox count and exists only as a leak backstop. */
const MAX_TRACKED = 1_000;

interface DialDead {
  /** Consecutive connect timeouts inside the streak window. */
  timeouts: number;
  /** When the last timeout was seen (streak freshness + prune age). */
  lastAtMs: number;
  /** True once the TCP probe failed for the candidate. */
  confirmed: boolean;
  /** Earliest instant a request may dial again (the probe slot). */
  probeAtMs: number;
}

// replica-local: a mark only makes one replica fail fast while the others
// still dial (today's behavior, bounded); a cleared mark on one replica costs
// the others one probe window. No correctness depends on cross-replica
// agreement, so this process's copy is its own source of truth.
const dialDeadMarks = new Map<string, DialDead>();

/** One TCP probe per key at a time: a concurrent burst awaiting confirmation
 *  shares the first caller's probe instead of dialling the box N times.
 *  replica-local: a shared probe only dedupes a burst within one replica; the
 *  other replicas' bursts dial the box once more, bounded by the ladder. */
const probesInFlight = new Map<string, Promise<boolean>>();

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
 *  makes the box a candidate; only the TCP probe confirms it. */
export function recordDialTimeout(key: string, nowMs = Date.now()): void {
  const previous = dialDeadMarks.get(key);
  const streak = previous && nowMs - previous.lastAtMs <= DIAL_DEAD_STREAK_WINDOW_MS ? previous.timeouts : 0;
  dialDeadMarks.set(key, { timeouts: streak + 1, lastAtMs: nowMs, confirmed: false, probeAtMs: 0 });
  pruneIfNeeded(nowMs);
}

/** A dial reached the box (any answer, even an error status): the path is
 *  proven and the mark is obsolete. */
export function clearDialDead(key: string): void {
  dialDeadMarks.delete(key);
  probesInFlight.delete(key);
}

/** Should this request skip the dial? True only for a CONFIRMED mark inside
 *  its fast-fail window. An expired window hands out the re-probe slot
 *  (renewed synchronously, so of a concurrent burst only the first caller
 *  re-probes); unconfirmed candidates dial normally and confirm through
 *  {@link confirmDialDeadIfUnreachable}. */
export function shouldFailFast(key: string, nowMs = Date.now()): boolean {
  const mark = dialDeadMarks.get(key);
  if (!mark || !mark.confirmed) return false;
  if (nowMs < mark.probeAtMs) return true;
  mark.probeAtMs = nowMs + DIAL_DEAD_PROBE_SPACING_MS;
  return false;
}

/** Confirm the candidate streak when the box's TCP layer fails the probe.
 *  Returns true = dial-dead, the caller skips the dial. A reachable TCP layer
 *  clears the streak entirely — the port served a connection, whatever its
 *  handler is doing. The probe is shared per key, so a concurrent burst
 *  confirms on one dial. */
export async function confirmDialDeadIfUnreachable(
  key: string,
  target: { hostname: string; port: number },
  nowMs = Date.now(),
): Promise<boolean> {
  const mark = dialDeadMarks.get(key);
  if (!mark || mark.confirmed || mark.timeouts < DIAL_DEAD_AFTER_TIMEOUTS) return false;
  let probe = probesInFlight.get(key);
  if (!probe) {
    probe = Promise.resolve(probeTarget(target)).finally(() => {
      if (probesInFlight.get(key) === probe) probesInFlight.delete(key);
    });
    probesInFlight.set(key, probe);
  }
  const reachable = await probe;
  // A concurrent dial may have answered while the probe ran — a success
  // outranks the probe, so never re-mark a cleared key.
  const current = dialDeadMarks.get(key);
  if (!current) return false;
  if (reachable) {
    dialDeadMarks.delete(key);
    return false;
  }
  if (current.confirmed) return true;
  current.confirmed = true;
  current.probeAtMs = nowMs + DIAL_DEAD_PROBE_SPACING_MS;
  return true;
}

/** The real probe: one bounded TCP connect to the box's ingress address.
 *  `Bun.connect` has no connect-timeout option, so the race bounds a
 *  black-holed SYN. */
export let probeTarget: (target: { hostname: string; port: number }) => Promise<boolean> =
  async (target) => {
    let budgetResolve!: (reachable: boolean) => void;
    const budget = new Promise<boolean>((resolve) => (budgetResolve = resolve));
    const attempt = Bun.connect({
      hostname: target.hostname,
      port: target.port,
      socket: {
        data() {},
        close() {},
        error() {},
      },
    })
      .then((socket) => {
        socket.end();
        return true;
      })
      .catch(() => false);
    const timer = setTimeout(() => budgetResolve(false), DIAL_PROBE_TIMEOUT_MS);
    timer.unref?.();
    return await Promise.race([attempt, budget]);
  };

/** The probe implementation a test stub replaces; `null` restores this one. */
let defaultProbeTarget = probeTarget;

/** Test-only: replace the TCP probe (unit tests and the mocked e2e harness
 *  must not dial the real network; `null` restores the real probe). */
export function __setDialProbeForTests(
  probe: ((target: { hostname: string; port: number }) => Promise<boolean>) | null,
): void {
  probeTarget = probe ?? defaultProbeTarget;
}

/** Test-only: drop every mark and in-flight probe. */
export function __resetDialDeadForTests(): void {
  dialDeadMarks.clear();
  probesInFlight.clear();
  probeTarget = defaultProbeTarget;
}
