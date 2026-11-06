import { expect, test } from 'bun:test';
import { accountHref, loginDestination } from './browser-login-navigation';
test('saved login destinations strip foreign selectors and reject origin escapes', () => {
  expect(accountHref('own', '/u/foreign/projects/p?q=1')).toBe('/u/own/projects/p?q=1');
  expect(accountHref('own', '/de/u/foreign/projects/p')).toBe('/de/u/own/projects/p');
  for (const destination of ['https://foreign.invalid', '//foreign.invalid', '/\\foreign.invalid', '/auth/callback', '/%2f%2fforeign.invalid']) {
    expect(loginDestination(destination)).toBe('/projects');
  }
  expect(accountHref('own', '/contact')).toBe('/u/own/projects');
});
