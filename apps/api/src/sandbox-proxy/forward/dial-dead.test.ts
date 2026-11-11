/**
 * The dial-dead mark (`forward/dial-dead.ts`): two consecutive connect
 * timeouts mark a box dead; every later request fails fast without dialling;
 * one request per probe window dials again; any answered dial clears the mark.
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
  __resetDialDeadForTests,
  clearDialDead,
  dialDeadKey,
  recordDialTimeout,
  shouldFailFast,
} from './dial-dead';

const T0 = 1_700_000_000_000;
const key = dialDeadKey('sbx-dead', 8000);

describe('the dial-dead streak', () => {
  test(`one timeout never marks (the stale-ingress case the ladder recovers from)`, () => {
    __resetDialDeadForTests();
    recordDialTimeout(key, T0);
    expect(shouldFailFast(key, T0 + 1)).toBe(false);
    expect(shouldFailFast(key, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 1)).toBe(false);
  });

  test('two timeouts inside the streak window mark the box dial-dead', () => {
    __resetDialDeadForTests();
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    expect(shouldFailFast(key, T0 + 1_001)).toBe(true);
  });

  test('a timeout outside the streak window starts a new streak', () => {
    __resetDialDeadForTests();
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 1);
    expect(shouldFailFast(key, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 2)).toBe(false);
  });

  test('an answered dial clears the mark', () => {
    __resetDialDeadForTests();
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    clearDialDead(key);
    expect(shouldFailFast(key, T0 + 1_001)).toBe(false);
  });
});

describe('the probe slot', () => {
  test('every request inside the window fails fast without dialling', () => {
    __resetDialDeadForTests();
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    expect(shouldFailFast(key, T0 + 2_000)).toBe(true);
    expect(shouldFailFast(key, T0 + 60_000)).toBe(true);
  });

  test('exactly one request per probe window dials again, then the window holds', () => {
    __resetDialDeadForTests();
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    expect(shouldFailFast(key, T0 + 1_000 + DIAL_DEAD_PROBE_SPACING_MS)).toBe(false);
    expect(shouldFailFast(key, T0 + 1_000 + DIAL_DEAD_PROBE_SPACING_MS + 1)).toBe(true);
  });

  test('a failed probe renews the slot through the next recordDialTimeout', () => {
    __resetDialDeadForTests();
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    // The probe dial times out too: its recordDialTimeout re-marks and the
    // slot moves to a fresh window.
    expect(shouldFailFast(key, T0 + 1_000 + DIAL_DEAD_PROBE_SPACING_MS)).toBe(false);
    recordDialTimeout(key, T0 + 1_000 + DIAL_DEAD_PROBE_SPACING_MS + 10_000);
    expect(shouldFailFast(key, T0 + 1_000 + DIAL_DEAD_PROBE_SPACING_MS + 20_000)).toBe(true);
    expect(shouldFailFast(key, T0 + 2_000 + 2 * DIAL_DEAD_PROBE_SPACING_MS + 10_000)).toBe(false);
  });
});
