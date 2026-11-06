import { expect, test } from 'bun:test';
import { accountHref, loginDestination } from './browser-login-navigation';
test('saved login destinations strip foreign selectors and reject origin escapes', () => {
  expect(accountHref('own', '/u/foreign/projects/p?q=1')).toBe('/u/own/projects/p?q=1');
  expect(accountHref('own', '/de/u/foreign/projects/p')).toBe('/de/u/own/projects/p');
  for (const destination of [
    'https://foreign.invalid',
    '//foreign.invalid',
    '/\\foreign.invalid',
    '/auth/callback',
    '/%2f%2fforeign.invalid',
  ]) {
    expect(loginDestination(destination)).toBe('/projects');
  }
  expect(accountHref('own', '/contact')).toBe('/u/own/projects');
});

test('authorization and installation handoffs retain their selected identity and query', () => {
  for (const path of [
    '/cli/authorize?code=synthetic',
    '/slack/install?state=synthetic',
    '/teams/install?state=synthetic',
    '/preview/authorize?to=synthetic',
  ]) {
    expect(accountHref('own', path)).toBe('/u/own' + path);
  }
  expect(loginDestination('/de/auth/callback?code=synthetic')).toBe('/projects');
});

test('an OAuth destination belongs to its exact attempt and rejects unbound old state', async () => {
  const { loginAttemptDestination } = await import('./browser-login-navigation');
  const stored = JSON.stringify({
    attempt: 'google-one',
    destination: '/cli/authorize?code=synthetic',
  });
  expect(loginAttemptDestination(stored, 'google-one', '/projects')).toBe(
    '/cli/authorize?code=synthetic',
  );
  expect(loginAttemptDestination(stored, 'password-two', '/settings/profile')).toBe(
    '/settings/profile',
  );
  expect(
    loginAttemptDestination('/cli/authorize?code=old', 'password-two', '/teams/install?state=new'),
  ).toBe('/teams/install?state=new');
});
