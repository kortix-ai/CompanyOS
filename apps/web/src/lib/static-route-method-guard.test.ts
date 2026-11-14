import { expect, test } from 'bun:test';
import { staticRouteMethodNotAllowed } from './static-route-method-guard';

test.each([
  ['POST', '/'],
  ['DELETE', '/llms.txt'],
  ['PUT', '/llms-full.txt'],
  ['PATCH', '/robots.txt'],
  ['POST', '/sitemap.xml'],
  ['POST', '/pricing'],
  ['DELETE', '/docs/developers'],
  ['PUT', '/apiary'],
])('%s %s answers 405 with Allow', (method, pathname) => {
  const res = staticRouteMethodNotAllowed(method, pathname, new Headers());
  expect(res?.status).toBe(405);
  expect(res?.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
});

test.each([
  ['GET', '/'],
  ['HEAD', '/llms.txt'],
  ['OPTIONS', '/'],
])('%s %s is left to the router', (method, pathname) => {
  expect(staticRouteMethodNotAllowed(method, pathname, new Headers())).toBeNull();
});

test.each(['/api/anything', '/api', '/v1/projects', '/scim/v2/Users', '/ingest/e', '/supabase/rest/v1/x', '/blog/post'])(
  'POST %s is left to its handler or proxy',
  (pathname) => {
    expect(staticRouteMethodNotAllowed('POST', pathname, new Headers())).toBeNull();
  },
);

test('a Server Action post is left to Next', () => {
  const headers = new Headers({ 'next-action': 'abc123' });
  expect(staticRouteMethodNotAllowed('POST', '/', headers)).toBeNull();
});
