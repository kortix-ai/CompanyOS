/** Regression coverage for the shared log-window throttle: the first line of
 * a window logs, later lines count toward the next emitted line's
 * `suppressed`. Moved here from dead-credential-log.test.ts with the engine
 * (shared/log-window.ts); the marked-refusal handler behavior stays pinned in
 * dead-credential-log.test.ts.
 */
import { describe, expect, test } from 'bun:test';

const { logWindowDecision, resetLogWindowsForTests } = await import('./log-window');

describe('log window decision', () => {
  test('the first refusal of a message logs, repeats inside the window are suppressed with the count kept', () => {
    resetLogWindowsForTests();
    let now = 1_000_000;
    expect(logWindowDecision('POST /p -> 401 [HTTPException] PAT not found or revoked', now)).toEqual({
      log: true,
      suppressed: 0,
    });
    for (let i = 1; i <= 4; i += 1) {
      now += 5_000;
      expect(logWindowDecision('POST /p -> 401 [HTTPException] PAT not found or revoked', now)).toEqual({
        log: false,
        suppressed: 0,
      });
    }
  });

  test('the next logged line after the window carries the volume suppressed since the previous one', () => {
    resetLogWindowsForTests();
    let now = 2_000_000;
    const key = 'POST /p -> 401 [HTTPException] PAT not found or revoked';
    expect(logWindowDecision(key, now).log).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      now += 1_000;
      logWindowDecision(key, now);
    }
    now += 601_000;
    const next = logWindowDecision(key, now);
    expect(next.log).toBe(true);
    expect(next.suppressed).toBe(3);
    // The count resets with the window: a refusal long after the burst does
    // not inherit the stale volume.
    now += 601_000;
    const later = logWindowDecision(key, now);
    expect(later.log).toBe(true);
    expect(later.suppressed).toBe(0);
  });

  test('a different message logs independently of another one inside its window', () => {
    resetLogWindowsForTests();
    const now = 3_000_000;
    expect(logWindowDecision('POST /p/turn-stream -> 401 [HTTPException] PAT not found or revoked', now).log).toBe(true);
    expect(logWindowDecision('POST /p/audit/events -> 401 [HTTPException] PAT not found or revoked', now).log).toBe(true);
    expect(logWindowDecision('POST /p/turn-stream -> 401 [HTTPException] PAT not found or revoked', now + 1_000).log).toBe(false);
  });

  test('the tracked-window map is bounded: the oldest key is evicted past the cap', () => {
    resetLogWindowsForTests();
    const now = 4_000_000;
    // Past the cap, the first key must have been evicted, so it logs again
    // immediately instead of being suppressed forever.
    expect(logWindowDecision('key-a', now).log).toBe(true);
    for (let i = 0; i < 20_000; i += 1) logWindowDecision(`key-${i}`, now);
    expect(logWindowDecision('key-a', now + 1_000).log).toBe(true);
  });
});
