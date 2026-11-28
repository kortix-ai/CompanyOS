import { expect, test } from 'bun:test';

import { sanitizeAuthReturnUrl } from '@/lib/auth/return-url';

import { AUTH_FLOW_PARAMS, bypassesSignupIntro, signupAuthHref } from './signup-handoff';

/** What `/auth` resolves as the destination: `returnUrl`, else `redirect`, sanitized. */
function destinationAtAuth(href: string): string {
  const params = new URL(href, 'https://kortix.test').searchParams;
  return sanitizeAuthReturnUrl(params.get('returnUrl') || params.get('redirect'));
}

test('a visit with no query hands off to bare /auth', () => {
  expect(signupAuthHref(new URLSearchParams())).toBe('/auth');
});

test('the whole query reaches /auth unchanged, nested queries and hashes included', () => {
  const returnUrl = '/invites/abc?account=a1&tab=x#members';
  const params = new URLSearchParams();
  params.set('returnUrl', returnUrl);
  params.set('utm_source', 'pricing');
  params.append('utm_source', 'navbar');
  const href = signupAuthHref(params);

  const received = new URL(href, 'https://kortix.test');
  expect(received.pathname).toBe('/auth');
  expect(received.searchParams.get('returnUrl')).toBe(returnUrl);
  expect(received.searchParams.getAll('utm_source')).toEqual(['pricing', 'navbar']);
  expect(received.search).toBe(`?${params.toString()}`);
});

test('/auth keeps its returnUrl-over-redirect precedence after the handoff', () => {
  const params = new URLSearchParams({ redirect: '/workspaces/two', returnUrl: '/workspaces/one' });
  expect(destinationAtAuth(signupAuthHref(params))).toBe('/workspaces/one');

  const onlyRedirect = new URLSearchParams({ redirect: '/cli/authorize?code=1' });
  expect(destinationAtAuth(signupAuthHref(onlyRedirect))).toBe('/cli/authorize?code=1');
});

test('an unsafe destination stays as unsafe after the handoff as before it, and /auth refuses it', () => {
  for (const unsafe of ['https://evil.test/x', '//evil.test', '/\\evil.test', 'javascript:alert(1)']) {
    const params = new URLSearchParams({ returnUrl: unsafe });
    const direct = sanitizeAuthReturnUrl(unsafe);
    expect(destinationAtAuth(signupAuthHref(params))).toBe(direct);
    expect(direct.startsWith('/')).toBe(true);
    expect(direct.startsWith('//')).toBe(false);
  }
});

test('an auth flow in progress skips the explanation', () => {
  for (const key of AUTH_FLOW_PARAMS) {
    expect(bypassesSignupIntro(new URLSearchParams({ [key]: '1' }))).toBe(true);
  }
});

test('a new visitor, with or without a destination, sees the explanation', () => {
  expect(bypassesSignupIntro(new URLSearchParams())).toBe(false);
  expect(bypassesSignupIntro(new URLSearchParams({ returnUrl: '/use-cases/x', utm_source: 'blog' }))).toBe(false);
});
