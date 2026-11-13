import { expect, test } from 'bun:test';
import { staticRouteMethodNotAllowed } from './static-route-method-guard';

test.each([
  ['POST', '/'],
  ['DELETE', '/llms.txt'],
  ['PUT', '/llms-full.txt'],
  ['PATCH', '/robots.txt'],
  ['POST', '/sitemap.xml'],
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

test('a path outside the static set is left to the router', () => {
  expect(staticRouteMethodNotAllowed('POST', '/auth', new Headers())).toBeNull();
  expect(staticRouteMethodNotAllowed('POST', '/api/anything', new Headers())).toBeNull();
});

test('a Server Action post is left to Next', () => {
  const headers = new Headers({ 'next-action': 'abc123' });
  expect(staticRouteMethodNotAllowed('POST', '/', headers)).toBeNull();
});
