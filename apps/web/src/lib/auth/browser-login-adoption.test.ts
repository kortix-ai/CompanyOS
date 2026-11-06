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
