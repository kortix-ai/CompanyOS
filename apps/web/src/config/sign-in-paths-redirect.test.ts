import { expect, test } from 'bun:test';
import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import config from '../../next.config';

const resolved: NextConfig = await config(PHASE_DEVELOPMENT_SERVER);

// KRTX-3154: /login and /signup are the paths people type. They bounced to
// /auth until unknown paths stopped bouncing, then answered "Page not found".
// /auth asks for the email first and picks sign-in or sign-up itself.
test('the conventional sign-in paths redirect to /auth', async () => {
  const redirects = (await resolved.redirects?.()) ?? [];
  const rule = redirects.find((candidate) => candidate.destination === '/auth');
  expect(rule).toMatchObject({ source: '/:path(login|signin|sign-in)', permanent: false });
});

// /signup is a page now (the explanation before the account), so it is no
// longer redirected; the other sign-up spellings land on it.
test('the conventional sign-up paths land on /signup, and /signup itself is not redirected', async () => {
  const redirects = (await resolved.redirects?.()) ?? [];
  const rule = redirects.find((candidate) => candidate.destination === '/signup');
  expect(rule).toMatchObject({ source: '/:path(sign-up|register)', permanent: false });
  expect(redirects.some((candidate) => /\bsignup\b/.test(candidate.source))).toBe(false);
});
