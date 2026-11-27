import { expect, test } from 'bun:test';
import { inboxCandidates, inboxUsername } from './managed-inbox';

test('a name becomes the part before the @', () => {
  expect(inboxUsername('Otto')).toBe('otto');
  expect(inboxUsername('Ana Lima')).toBe('ana-lima');
  expect(inboxUsername("O'Brien")).toBe('o-brien');
  expect(inboxUsername('  ..Max.. ')).toBe('max');
  expect(inboxUsername('Zoë')).toBe('zo');
  expect(inboxUsername('---')).toBeNull();
});

test('the bare name first, then the workspace suffix, then a random one', () => {
  const candidates = inboxCandidates('otto', '4f2a9c1e-0000-0000-0000-000000000000', () => 'b7d1e2f3-aaaa');
  expect(candidates).toEqual(['otto', 'otto-4f2a', 'otto-b7d1']);
});
