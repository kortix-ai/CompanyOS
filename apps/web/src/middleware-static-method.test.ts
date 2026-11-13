import { expect, test } from 'bun:test';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

// KRTX-4826: a non-GET method on `/` or a static file route was answered by
// the host with a bare 405. The middleware answers it with the Allow header.
test('POST / answers 405 with Allow through the middleware', async () => {
  const res = await middleware(new NextRequest('https://kortix.com/', { method: 'POST' }));
  expect(res.status).toBe(405);
  expect(res.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
});

test('DELETE /llms.txt answers 405 with Allow through the middleware', async () => {
  const res = await middleware(new NextRequest('https://kortix.com/llms.txt', { method: 'DELETE' }));
  expect(res.status).toBe(405);
  expect(res.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
});

test('GET /llms.txt still reaches the route', async () => {
  const res = await middleware(new NextRequest('https://kortix.com/llms.txt'));
  expect(res.status).not.toBe(405);
});
