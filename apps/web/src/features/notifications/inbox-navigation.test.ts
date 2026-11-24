import { expect, test } from 'bun:test';
import { inboxHref, inboxReturnHref } from './inbox-navigation';

test('Inbox returns to each exact originating workspace route', () => {
  for (const path of [
    '/workspaces/demo/goals?sort=name#active',
    '/workspaces/demo/files?path=%2Fnotes',
  ]) {
    const link = new URL(inboxHref(path), 'https://kortix.test');
    expect(link.pathname).toBe('/inbox');
    expect(inboxReturnHref(link.searchParams.get('from'))).toBe(path);
  }
});

test('direct entry and unsafe destinations fall back to workspaces', () => {
  for (const path of [
    null,
    '',
    'https://outside.test',
    '//outside.test',
    '/\\outside.test',
    '/inbox',
    '/inbox?from=/inbox',
    '/inbox/',
    '/en/inbox',
    '/auth',
    '/workspaces/../inbox',
  ]) {
    expect(inboxReturnHref(path)).toBe('/workspaces');
  }
});
