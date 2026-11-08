// The bounded-promise contract, pinned where the helper lives today (the auth
// submit): a deadline resolves with the fallback, and the loser of the race
// can never surface later as an unhandled rejection.
import { describe, expect, test } from 'bun:test';

import { settleWithin } from '@/lib/auth/submit-auth';

describe('settleWithin', () => {
  test('resolves with the promise itself when it settles within the budget', async () => {
    await expect(settleWithin(Promise.resolve('ok'), 20, () => 'fallback')).resolves.toBe('ok');
  });

  test('resolves with the fallback when the promise outlives the budget', async () => {
    await expect(settleWithin(new Promise<string>(() => {}), 5, () => 'fallback')).resolves.toBe(
      'fallback',
    );
  });

  // A loser that rejects after the deadline has been swallowed: bun fails any
  // run that leaves it unhandled, so this file passing is the assertion.
  test('a promise rejecting after the budget does not surface as an unhandled rejection', async () => {
    const loser = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('loser rejects after the budget')), 20),
    );
    await expect(settleWithin(loser, 5, () => 'fallback')).resolves.toBe('fallback');
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
});
