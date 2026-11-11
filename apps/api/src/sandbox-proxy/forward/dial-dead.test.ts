/**
 * The dial-dead mark (`forward/dial-dead.ts`): two consecutive connect
 * timeouts make a box a candidate, but only a FAILED TCP PROBE confirms it —
 * the proxy's connect timer bounds the header phase too, so a healthy-but-slow
 * handler must never mark. After confirmation every request fails fast without
 * dialling, one request per probe window dials again, and any answered dial
 * clears the mark.
 *
 * KRTX-4459: a session box whose daemon died on a running box answered no TCP
 * connect, and every client poll walked the proxy's full ~50 s retry ladder
 * before the give-up 502 — ~5% of a small hour's rows read 45-50 s and the
 * route's p95 read 15-45 s while its p50 stayed at ~90 ms.
 */
import { describe, expect, test } from 'bun:test';
import {
  DIAL_DEAD_AFTER_TIMEOUTS,
  DIAL_DEAD_PROBE_SPACING_MS,
  DIAL_DEAD_STREAK_WINDOW_MS,
  DIAL_PROBE_TIMEOUT_MS,
  __resetDialDeadForTests,
  __setDialProbeForTests,
  clearDialDead,
  confirmDialDeadIfUnreachable,
  dialDeadKey,
  recordDialTimeout,
  shouldFailFast,
} from './dial-dead';

const T0 = 1_700_000_000_000;
const key = dialDeadKey('sbx-dead', 8000);
const target = { hostname: 'box-ingress.test', port: 8000 };
const unreachable = async () => false;
const reachable = async () => true;

describe('the dial-dead streak', () => {
  test(`one timeout never marks (the stale-ingress case the ladder recovers from)`, async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unreachable);
    recordDialTimeout(key, T0);
    expect(await confirmDialDeadIfUnreachable(key, target, T0 + 1)).toBe(false);
    expect(shouldFailFast(key, T0 + 1)).toBe(false);
    expect(await confirmDialDeadIfUnreachable(key, target, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 1)).toBe(false);
  });

  test('two timeouts make a candidate, but a failed TCP probe is what confirms', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unreachable);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    expect(shouldFailFast(key, T0 + 1_001)).toBe(false);
    expect(await confirmDialDeadIfUnreachable(key, target, T0 + 1_001)).toBe(true);
    expect(shouldFailFast(key, T0 + 1_002)).toBe(true);
  });

  test('a reachable TCP layer clears the streak — a slow handler never poisons the port', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(reachable);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    expect(await confirmDialDeadIfUnreachable(key, target, T0 + 1_001)).toBe(false);
    expect(shouldFailFast(key, T0 + 1_002)).toBe(false);
    // The cleared streak starts over: one more timeout is again only a candidate.
    recordDialTimeout(key, T0 + 2_000);
    expect(await confirmDialDeadIfUnreachable(key, target, T0 + 2_001)).toBe(false);
  });

  test('a timeout outside the streak window starts a new streak', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unreachable);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 1);
    expect(await confirmDialDeadIfUnreachable(key, target, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 2)).toBe(false);
  });

  test('an answered dial clears the mark', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unreachable);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await confirmDialDeadIfUnreachable(key, target, T0 + 1_001);
    clearDialDead(key);
    expect(shouldFailFast(key, T0 + 1_002)).toBe(false);
  });
});

describe('the probe slot of a confirmed mark', () => {
  test('every request inside the window fails fast without dialling', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unreachable);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await confirmDialDeadIfUnreachable(key, target, T0 + 1_001);
    expect(shouldFailFast(key, T0 + 2_000)).toBe(true);
    expect(shouldFailFast(key, T0 + 60_000)).toBe(true);
  });

  test('exactly one request per probe window dials again, then the window holds', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unreachable);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await confirmDialDeadIfUnreachable(key, target, T0 + 1_001);
    expect(shouldFailFast(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS)).toBe(false);
    expect(shouldFailFast(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS + 1)).toBe(true);
  });

  test('a failed probe dial renews the slot through the next recordDialTimeout', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unreachable);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await confirmDialDeadIfUnreachable(key, target, T0 + 1_001);
    // The re-probe dial times out too: its recordDialTimeout re-marks and the
    // slot moves to a fresh window.
    expect(shouldFailFast(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS)).toBe(false);
    recordDialTimeout(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS + 10_000);
    await confirmDialDeadIfUnreachable(key, target, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS + 10_001);
    expect(shouldFailFast(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS + 20_000)).toBe(true);
    expect(shouldFailFast(key, T0 + 2_001 + 2 * DIAL_DEAD_PROBE_SPACING_MS + 10_000)).toBe(false);
  });
});

test('constants keep their contract', () => {
  expect(DIAL_DEAD_AFTER_TIMEOUTS).toBe(2);
  expect(DIAL_PROBE_TIMEOUT_MS).toBeLessThan(DIAL_DEAD_STREAK_WINDOW_MS);
});
