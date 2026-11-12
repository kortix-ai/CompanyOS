// Provider auth-failure classification and outage escalation (KRTX-4792).
//
// Own module, not shared/daytona.ts: every adapter and several test files
// mock shared/daytona wholesale (it wraps the SDK client), and a consumer
// that imports its classifier from a mocked module receives `undefined`.
import { logger } from '../lib/logger';
import { captureException } from '../lib/sentry';

/**
 * True iff `err` carries an HTTP 401/403 status — a dead or revoked provider
 * credential — whichever provider threw it: the Daytona SDK's own 401 error
 * ("DaytonaAuthenticationError: Invalid credentials", statusCode 401) and the
 * Platinum adapter's `PlatinumHttpError` (`.status`) both carry one of these
 * fields. Never a transient provider hiccup, and a message that merely
 * mentions credentials never misclassifies: any unclear error keeps the
 * caller's existing behavior.
 */
export function isProviderAuthFailure(err: unknown): boolean {
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

/** The human remediation per provider — the escalated message's whole point. */
const PROVIDER_REMEDIATION: Record<string, string> = {
  daytona: 'fix or rotate DAYTONA_API_KEY, or top up the Daytona org',
  platinum: 'fix or rotate PLATINUM_API_KEY',
};

/** One escalation per process per window — enough for each error group to stay hot, not enough to spam. */
const AUTH_OUTAGE_ESCALATION_INTERVAL_MS = 15 * 60_000;

// Per-process by design: the worker runs as one task, and a lost timestamp
// only re-alerts. In-memory on purpose — no DB write from an error path.
// One timestamp across providers: a suppressed provider's next pass (the
// loops retry every ~5 min) escalates once the window passes — a delay, never
// a lost page.
let lastAuthOutageEscalationAt = 0;

/**
 * Escalate a provider auth outage to the error tracker. Every call to a
 * provider with a dead credential fails, but those failures surface only as
 * per-target warn lines — and warn logs never reach Better Stack's error
 * groups, which is what pages (KRTX-4792: the 2026-11 Daytona outage ran for
 * days unseen). This captures ONE Sentry error (an error group the watchdog
 * pages on) and logs ONE error-level line naming the remediation, rate-
 * limited to one per window. The caller passes the provider the failing call
 * targeted, so the page names the right key — a Platinum 401 at a
 * provider-agnostic call site must not page the Daytona remediation.
 * Anything that is not an auth/credits failure is a no-op, so call sites can
 * pass every caught error through. Returns whether it escalated (for tests).
 */
export function escalateProviderAuthOutage(
  provider: string,
  action: string,
  error: unknown,
  now = Date.now(),
): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const isAuthOutage = isProviderAuthFailure(error)
    || message.toLowerCase().includes(ORG_OUT_OF_CREDITS_SUBSTRING);
  if (!isAuthOutage) return false;
  if (now - lastAuthOutageEscalationAt < AUTH_OUTAGE_ESCALATION_INTERVAL_MS) return false;
  lastAuthOutageEscalationAt = now;
  const remediation = PROVIDER_REMEDIATION[provider]
    ?? `check the ${provider} provider credential`;
  logger.error(`[${provider}] auth outage: every ${provider} API call is rejected; ${remediation}`, {
    action,
    error: message.slice(0, 200),
  });
  captureException(new Error(`[${provider}] API rejects every call — ${remediation}`), {
    action,
    errorName: error instanceof Error ? error.name : 'Error',
    errorMessage: message.slice(0, 200),
  });
  return true;
}

/** Test-only: reset the escalation rate-limit window. */
export function __resetProviderAuthOutageForTest(): void {
  lastAuthOutageEscalationAt = 0;
}
