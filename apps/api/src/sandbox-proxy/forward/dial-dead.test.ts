/**
 * The dial-dead mark (`forward/dial-dead.ts`): two consecutive connect
 * timeouts make a box a candidate, but only an HTTP probe through the ingress
 * that receives NO answer confirms it — the proxy's connect timer bounds the
 * header phase too, so a healthy-but-slow handler must never mark, and an
 * HTTPS provider edge accepts TCP whatever the box behind it does, so only a
 * settled HTTP response (any status) proves the path alive. After
 * confirmation every request fails fast without dialling, one request per
 * probe window dials again, and any answered dial clears the mark.
 *
 * KRTX-4459: a session box whose daemon died on a running box answered no
 * request, and every client poll walked the proxy's full ~50 s retry ladder
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
  __setDialProbeBudgetForTests,
  __setDialProbeForTests,
  clearDialDead,
  dialDeadKey,
  maybeProbeDialDeadCandidate,
  probeTarget,
  recordDialTimeout,
  shouldFailFast,
} from './dial-dead';
import { PROXY_ATTEMPT_TIMEOUT_MS } from '../preview-retry-budget';

const T0 = 1_700_000_000_000;
const key = dialDeadKey('sbx-dead', 8000);
const target = { url: 'https://box-ingress.test/kortix/runtime/pending', headers: { authorization: 'Bearer k' } };
const unanswered = async () => false;
const answered = async () => true;

describe('the dial-dead streak', () => {
  test(`one timeout never marks (the stale-ingress case the ladder recovers from)`, async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unanswered);
    recordDialTimeout(key, T0);
    await maybeProbeDialDeadCandidate(key, target);
    expect(shouldFailFast(key, T0 + 1)).toBe(false);
    recordDialTimeout(key, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 1);
    await maybeProbeDialDeadCandidate(key, target);
    expect(shouldFailFast(key, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 2)).toBe(false);
  });

  test('two timeouts make a candidate, but an unanswered probe is what confirms', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unanswered);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    expect(shouldFailFast(key, T0 + 1_001)).toBe(false);
    await maybeProbeDialDeadCandidate(key, target, T0 + 1_001);
    expect(shouldFailFast(key, T0 + 1_002)).toBe(true);
  });

  test('a probe that receives an answer clears the streak — a slow handler never poisons the port', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(answered);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await maybeProbeDialDeadCandidate(key, target);
    expect(shouldFailFast(key, T0 + 1_002)).toBe(false);
    // The cleared streak starts over: one more timeout is again only a candidate.
    recordDialTimeout(key, T0 + 2_000);
    await maybeProbeDialDeadCandidate(key, target);
    expect(shouldFailFast(key, T0 + 2_001)).toBe(false);
  });

  test('a timeout outside the streak window starts a new streak', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unanswered);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 1);
    await maybeProbeDialDeadCandidate(key, target);
    expect(shouldFailFast(key, T0 + DIAL_DEAD_STREAK_WINDOW_MS + 2)).toBe(false);
  });

  test('an answered dial clears the mark', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unanswered);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await maybeProbeDialDeadCandidate(key, target, T0 + 1_001);
    clearDialDead(key);
    expect(shouldFailFast(key, T0 + 1_002)).toBe(false);
  });

  test('concurrent callers share one probe', async () => {
    __resetDialDeadForTests();
    let probeCalls = 0;
    let release!: (answered: boolean) => void;
    __setDialProbeForTests(() => {
      probeCalls += 1;
      return new Promise<boolean>((resolve) => (release = resolve));
    });
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    const first = maybeProbeDialDeadCandidate(key, target);
    const second = maybeProbeDialDeadCandidate(key, target);
    expect(probeCalls).toBe(1);
    release(false);
    await Promise.all([first, second]);
    expect(shouldFailFast(key, T0 + 1_002)).toBe(true);
  });
});

describe('the probe slot of a confirmed mark', () => {
  test('every request inside the window fails fast without dialling', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unanswered);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await maybeProbeDialDeadCandidate(key, target, T0 + 1_001);
    expect(shouldFailFast(key, T0 + 2_000)).toBe(true);
    expect(shouldFailFast(key, T0 + 60_000)).toBe(true);
  });

  test('exactly one request per probe window dials again, then the window holds', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unanswered);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await maybeProbeDialDeadCandidate(key, target, T0 + 1_001);
    expect(shouldFailFast(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS)).toBe(false);
    expect(shouldFailFast(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS + 1)).toBe(true);
  });

  test('a re-probe dial timing out does not un-confirm the mark', async () => {
    __resetDialDeadForTests();
    __setDialProbeForTests(unanswered);
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await maybeProbeDialDeadCandidate(key, target, T0 + 1_001);
    // The window expires and hands out the re-probe slot; the re-probe dial
    // times out too. The box just proved dead again: the mark and the window
    // hold, so the requests after the re-probe still fail fast.
    expect(shouldFailFast(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS)).toBe(false);
    recordDialTimeout(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS + 10_000);
    expect(shouldFailFast(key, T0 + 1_001 + DIAL_DEAD_PROBE_SPACING_MS + 10_001)).toBe(true);
    expect(shouldFailFast(key, T0 + 1_001 + 2 * DIAL_DEAD_PROBE_SPACING_MS + 10_000)).toBe(false);
  });
});

describe('the real HTTP probe against real servers', () => {
  // The reviewer's topology (2026-11-11): the ingress is a live edge, so a TCP
  // connect always succeeds even when the box behind it answers nothing. The
  // REAL probe — no stub — must read the topology through the HTTP response.
  test('a hanging handler behind an accepting connection is dial-dead', async () => {
    __resetDialDeadForTests();
    __setDialProbeBudgetForTests(1_000);
    const server = Bun.serve({
      port: 0,
      fetch: () => new Promise<Response>(() => {}), // accepts, never answers
    });
    try {
      recordDialTimeout(key, T0);
      recordDialTimeout(key, T0 + 1_000);
      await maybeProbeDialDeadCandidate(key, { url: `${server.url}kortix/runtime/pending`, headers: {} });
      expect(shouldFailFast(key, T0 + 2_000)).toBe(true);
    } finally {
      server.stop(true);
      __resetDialDeadForTests();
    }
  });

  test('a handler that answers within the probe budget is alive', async () => {
    __resetDialDeadForTests();
    __setDialProbeBudgetForTests(3_000);
    const server = Bun.serve({
      port: 0,
      fetch: async () => {
        await Bun.sleep(200); // answers later than the attempt timer would like, within the probe budget
        return new Response('late');
      },
    });
    try {
      recordDialTimeout(key, T0);
      recordDialTimeout(key, T0 + 1_000);
      await maybeProbeDialDeadCandidate(key, { url: `${server.url}kortix/runtime/pending`, headers: {} });
      expect(shouldFailFast(key, T0 + 2_000)).toBe(false);
    } finally {
      server.stop(true);
      __resetDialDeadForTests();
    }
  });

  test('a refused connection is dial-dead', async () => {
    __resetDialDeadForTests();
    __setDialProbeBudgetForTests(1_000);
    const server = Bun.serve({ port: 0, fetch: () => new Response('up') });
    const url = server.url;
    server.stop(true); // nothing listens there any more
    recordDialTimeout(key, T0);
    recordDialTimeout(key, T0 + 1_000);
    await maybeProbeDialDeadCandidate(key, { url: `${url}kortix/runtime/pending`, headers: {} });
    expect(shouldFailFast(key, T0 + 2_000)).toBe(true);
  });

  test('the real probe answers what an HTTP response answers, and nothing else', async () => {
    __resetDialDeadForTests();
    __setDialProbeBudgetForTests(1_000);
    const server = Bun.serve({ port: 0, fetch: () => new Response('up', { status: 503 }) });
    try {
      expect(await probeTarget({ url: `${server.url}x`, headers: {} })).toBe(true);
    } finally {
      server.stop(true);
      __resetDialDeadForTests();
    }
  });
});

test('constants keep their contract', () => {
  expect(DIAL_DEAD_AFTER_TIMEOUTS).toBe(2);
  // The probe budget exceeds one attempt timer (the header wait that forms the
  // streak), so a handler that answers late is served by the probe; it stays
  // inside the streak window.
  expect(DIAL_PROBE_TIMEOUT_MS).toBeGreaterThan(PROXY_ATTEMPT_TIMEOUT_MS);
  expect(DIAL_PROBE_TIMEOUT_MS).toBeLessThan(DIAL_DEAD_STREAK_WINDOW_MS);
});
