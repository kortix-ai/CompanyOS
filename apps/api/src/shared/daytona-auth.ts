// Daytona auth-failure classification and outage escalation (KRTX-4792).
//
// Own module, not shared/daytona.ts: every adapter and several test files
// mock shared/daytona wholesale (it wraps the SDK client), and a consumer
// that imports its classifier from a mocked module receives `undefined`.
import { logger } from '../lib/logger';
import { captureException } from '../lib/sentry';

/**
 * True iff `err` is a genuine auth/authorization failure from the Daytona API
 * (HTTP 401/403 — a dead/revoked `DAYTONA_API_KEY`), never a transient
 * provider hiccup. Same narrow, status-only contract as the Platinum adapter's
 * `isPlatinumAuthFailure`: a message that merely mentions credentials never
 * misclassifies, and any unclear error keeps the caller's existing behavior.
 * The SDK's own 401 error ("DaytonaAuthenticationError: Invalid credentials",
 * statusCode 401) carries the status this reads.
 */
export function isDaytonaAuthFailure(err: unknown): boolean {
  const value = err as
    | {
        status?: unknown;
        statusCode?: unknown;
        response?: { status?: unknown };
      }
    | null
    | undefined;
  const statuses = [value?.statusCode, value?.response?.status, value?.status];
  return statuses.some((status) => status === 401 || status === 403);
}

/**
 * Daytona's response when the ORG (shared across every environment) is
 * suspended for credit exhaustion: a permanent fault a retry can never fix.
 * Matched on the message alone because the API answers it without a distinct
 * auth status (2026-11 outage: it preceded the 401s by 11 days).
 */
const ORG_OUT_OF_CREDITS_SUBSTRING = 'out of credits';

/** One escalation per process per window — enough for the error group to stay hot, not enough to spam it. */
const AUTH_OUTAGE_ESCALATION_INTERVAL_MS = 15 * 60_000;

// Per-process by design: the worker runs as one task, and a lost timestamp
// only re-alerts. In-memory on purpose — no DB write from an error path.
let lastAuthOutageEscalationAt = 0;

/**
 * Escalate a Daytona auth outage to the error tracker. Every Daytona call
 * fails when the key is dead or the org is out of credits, but those failures
 * surface only as per-target warn lines — and warn logs never reach Better
 * Stack's error groups, which is what pages (KRTX-4792: the 2026-11 outage
 * ran for days unseen). This captures ONE Sentry error (an error group the
 * watchdog pages on) and logs ONE error-level line naming the remediation,
 * rate-limited to one per window. Anything that is not an auth/credits
 * failure is a no-op, so call sites can pass every caught error through.
 * Returns whether it escalated (exposed for tests).
 */
export function escalateDaytonaAuthOutage(action: string, error: unknown, now = Date.now()): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const isAuthOutage = isDaytonaAuthFailure(error)
    || message.toLowerCase().includes(ORG_OUT_OF_CREDITS_SUBSTRING);
  if (!isAuthOutage) return false;
  if (now - lastAuthOutageEscalationAt < AUTH_OUTAGE_ESCALATION_INTERVAL_MS) return false;
  lastAuthOutageEscalationAt = now;
  const remediation = 'fix or rotate DAYTONA_API_KEY, or top up the Daytona org';
  logger.error(`[daytona] auth outage: every Daytona API call is rejected; ${remediation}`, {
    action,
    error: message.slice(0, 200),
  });
  captureException(new Error(`[daytona] API rejects every call — ${remediation}`), {
    action,
    errorName: error instanceof Error ? error.name : 'Error',
    errorMessage: message.slice(0, 200),
  });
  return true;
}

/** Test-only: reset the escalation rate-limit window. */
export function __resetDaytonaAuthOutageForTest(): void {
  lastAuthOutageEscalationAt = 0;
}
