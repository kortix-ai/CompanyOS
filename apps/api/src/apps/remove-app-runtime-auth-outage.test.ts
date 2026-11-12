// KRTX-4792 regression: a persistent provider auth outage (a dead/suspended
// provider org — HTTP 401 `Invalid credentials`, org `Out of credits`) used to
// surface only as per-target warn lines that page nobody. The factory watchdog
// reads Better Stack error groups (Sentry); warn logs never reach that product,
// so the 2026-11 Daytona outage ran for days before a person saw it. The fix
// escalates: the first auth-classified failure captures ONE error to Sentry
// (an error group the watchdog pages on) plus ONE error-level log line naming
// THAT provider's remediation, rate-limited to one per 15 min per process.
// The call sites are provider-agnostic (an App can host on either provider),
// so the escalation is provider-neutral: the caller passes the provider the
// failing call targeted, and a Platinum 401 never pages the Daytona
// remediation (the G9 review's repro on PR #12557).
//
// Run: pnpm --filter kortix-api test src/apps/remove-app-runtime-auth-outage.test.ts
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const captured: Array<{ error: unknown; context?: Record<string, unknown> }> = [];
const errorLogs: Array<{ message: string; context?: Record<string, unknown> }> = [];

// Do NOT import the real modules first: a module bun has already instantiated
// keeps its original instance in the ESM cache and the mock never applies
// (the capture spy would silently never fire). Hand-list the exports instead —
// lib/sentry and lib/logger export exactly these names.
mock.module('../lib/sentry', () => ({
  captureException: (error: unknown, context?: Record<string, unknown>) => {
    captured.push({ error, context });
  },
}));
mock.module('../lib/logger', () => ({
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string, context?: Record<string, unknown>) => {
      errorLogs.push({ message, context });
    },
    localError: () => {},
    localWarn: () => {},
    flush: async (): Promise<void> => {},
  },
  isLoggingTransportError: () => false,
}));

const { removeAppRuntime } = await import('./images');
const { escalateProviderAuthOutage, __resetProviderAuthOutageForTest } = await import('../shared/provider-auth');

/** The SDK's real 401 shape: DaytonaAuthenticationError carries statusCode (#12549's probe). */
function daytona401(): Error {
  return Object.assign(new Error('Invalid credentials'), {
    name: 'DaytonaAuthenticationError',
    statusCode: 401,
  });
}

/** The Platinum adapter's real 401 shape: PlatinumHttpError carries .status (shared/platinum.ts). */
function platinum401(): Error {
  return Object.assign(new Error('platinum DELETE /v1/sandboxes/box-1 -> 401 {"code":"unauthorized"}'), {
    name: 'PlatinumHttpError',
    status: 401,
  });
}

beforeEach(() => {
  captured.length = 0;
  errorLogs.length = 0;
  __resetProviderAuthOutageForTest();
});

describe('escalateProviderAuthOutage', () => {
  // A realistic wall-clock base: the reset sets last=0, so `now` must sit at
  // least one window past it for the first call to escalate.
  const T0 = 1_700_000_000_000;

  test('the first auth-classified failure captures one error and logs one error line', () => {
    const escalated = escalateProviderAuthOutage('daytona', 'app runtime removal', daytona401(), T0);
    expect(escalated).toBe(true);
    expect(captured.length).toBe(1);
    const message = captured[0]!.error instanceof Error ? captured[0]!.error.message : '';
    expect(message).toContain('DAYTONA_API_KEY');
    expect(captured[0]!.context).toMatchObject({ action: 'app runtime removal' });
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0]!.message).toContain('DAYTONA_API_KEY');
  });

  test("a Platinum 401 pages the PLATINUM remediation, never the Daytona one (the G9 review's repro)", () => {
    const escalated = escalateProviderAuthOutage('platinum', 'app runtime removal', platinum401(), T0);
    expect(escalated).toBe(true);
    expect(captured.length).toBe(1);
    const message = captured[0]!.error instanceof Error ? captured[0]!.error.message : '';
    expect(message).toContain('[platinum] API rejects every call');
    expect(message).toContain('PLATINUM_API_KEY');
    expect(message).not.toContain('DAYTONA_API_KEY');
    expect(message).not.toContain('Daytona org');
    expect(errorLogs[0]!.message).toContain('PLATINUM_API_KEY');
    expect(errorLogs[0]!.message).not.toContain('DAYTONA_API_KEY');
  });

  test('a failure inside the 15 min window does not escalate again', () => {
    expect(escalateProviderAuthOutage('daytona', 'app runtime removal', daytona401(), T0)).toBe(true);
    expect(escalateProviderAuthOutage('platinum', 'orphan-box reaper list', platinum401(), T0 + 15 * 60_000 - 1)).toBe(false);
    expect(captured.length).toBe(1);
  });

  test('a failure after the window escalates again', () => {
    expect(escalateProviderAuthOutage('daytona', 'app runtime removal', daytona401(), T0)).toBe(true);
    expect(escalateProviderAuthOutage('daytona', 'app runtime removal', daytona401(), T0 + 15 * 60_000)).toBe(true);
    expect(captured.length).toBe(2);
  });

  test('a transient provider failure (502, timeout) never escalates', () => {
    expect(escalateProviderAuthOutage('daytona', 'app runtime removal', new Error('delete -> 502'), T0)).toBe(false);
    expect(escalateProviderAuthOutage('daytona', 'app runtime removal', new Error('Daytona get(x) timed out'), T0)).toBe(false);
    expect(captured.length).toBe(0);
    expect(errorLogs.length).toBe(0);
  });

  test("Daytona's org out-of-credits response is an auth outage (the 2026-11 incident's first, key-valid phase)", () => {
    const err = new Error('Out of credits. Pick a plan or top up to continue.');
    expect(escalateProviderAuthOutage('daytona', 'snapshot quota GC', err, T0)).toBe(true);
    expect(captured.length).toBe(1);
  });

  test('an error that merely mentions credentials without an auth status never escalates', () => {
    expect(escalateProviderAuthOutage('daytona', 'app runtime removal', new Error('cache: Invalid credentials entry'), T0)).toBe(false);
    expect(captured.length).toBe(0);
  });

  test('a provider outside the remediation map still escalates with a neutral line', () => {
    const escalated = escalateProviderAuthOutage('exotic', 'app runtime removal', daytona401(), T0);
    expect(escalated).toBe(true);
    const message = captured[0]!.error instanceof Error ? captured[0]!.error.message : '';
    expect(message).toContain('[exotic] API rejects every call');
    expect(message).toContain('check the exotic provider credential');
  });
});

describe('removeAppRuntime escalation wire-up', () => {
  test('a Daytona 401 during App runtime teardown escalates the outage', async () => {
    const runtime = { runtimeId: 'rt-1', provider: 'daytona', externalId: 'box-1' };
    const gone = await removeAppRuntime(runtime, () => ({
      remove: async () => { throw daytona401(); },
      getStatus: async () => { throw daytona401(); },
    }) as never);
    expect(gone).toBe(false);
    expect(captured.length).toBe(1);
    const message = captured[0]!.error instanceof Error ? captured[0]!.error.message : '';
    expect(message).toContain('DAYTONA_API_KEY');
  });

  test('a Platinum 401 at the same provider-agnostic call site pages the PLATINUM remediation', async () => {
    const runtime = { runtimeId: 'rt-2', provider: 'platinum', externalId: 'vm-1' };
    const gone = await removeAppRuntime(runtime, () => ({
      remove: async () => { throw platinum401(); },
      getStatus: async () => { throw platinum401(); },
    }) as never);
    expect(gone).toBe(false);
    expect(captured.length).toBe(1);
    const message = captured[0]!.error instanceof Error ? captured[0]!.error.message : '';
    expect(message).toContain('PLATINUM_API_KEY');
    expect(message).not.toContain('DAYTONA_API_KEY');
  });

  test('a removal that proves the runtime gone never escalates', async () => {
    const runtime = { runtimeId: 'rt-3', provider: 'daytona', externalId: 'box-2' };
    const gone = await removeAppRuntime(runtime, () => ({
      remove: async () => { throw daytona401(); },
      getStatus: async () => 'removed',
    }) as never);
    expect(gone).toBe(true);
    expect(captured.length).toBe(0);
  });

  test('a plain provider 502 keeps the old behavior and never escalates', async () => {
    const runtime = { runtimeId: 'rt-4', provider: 'daytona', externalId: 'box-3' };
    const gone = await removeAppRuntime(runtime, () => ({
      remove: async () => { throw new Error('DELETE -> 502'); },
      getStatus: async () => 'running',
    }) as never);
    expect(gone).toBe(false);
    expect(captured.length).toBe(0);
  });
});
