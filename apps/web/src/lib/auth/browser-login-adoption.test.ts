import { expect, test } from 'bun:test';
import { savedSlotForLegacyUser } from './browser-login-adoption';

test('an existing legacy tab follows only its own saved identity', () => {
  const slots = [{ slot: 'saved-B', user_id: 'user-B' }];
  expect(savedSlotForLegacyUser(slots, 'user-A')).toBeNull();
  expect(savedSlotForLegacyUser([...slots, { slot: 'saved-A', user_id: 'user-A' }], 'user-A')).toBe(
    'saved-A',
  );
  expect(savedSlotForLegacyUser(slots, null)).toBe('saved-B');
  expect(
    savedSlotForLegacyUser([...slots, { slot: 'saved-A', user_id: 'user-A' }], null),
  ).toBeNull();
});

test('a working ordinary identity does not enter a saved slot that requires recovery', () => {
  expect(
    savedSlotForLegacyUser([{ slot: 'saved-A', user_id: 'user-A', needs_sign_in: true }], 'user-A'),
  ).toBeNull();
});

test('legacy retirement is eligible only for the same nonempty saved user', async () => {
  const { legacySessionMatchesSavedUser } = await import('./browser-login-adoption');
  expect(legacySessionMatchesSavedUser('user-A', 'user-A')).toBe(true);
  expect(legacySessionMatchesSavedUser('user-A', 'user-B')).toBe(false);
  expect(legacySessionMatchesSavedUser(undefined, 'user-A')).toBe(false);
  expect(legacySessionMatchesSavedUser('', '')).toBe(false);
});
