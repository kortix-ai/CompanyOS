import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';

// `config` reads required env at module-load time, so set it before importing
// `./server` (same pattern as server.test.ts). The limit itself is passed to
// `buildServer`, so this test does not depend on module-load order.
process.env.KORTIX_API_URL = process.env.KORTIX_API_URL ?? 'https://api.test.invalid';
process.env.GATEWAY_INTERNAL_TOKEN = process.env.GATEWAY_INTERNAL_TOKEN ?? 'test-internal-token';

const { buildServer } = await import('./server');

// The fake API answers the gateway's one-call admission, and only that: an API
// in a different rollout answers 404 everywhere else. A bearer it knows comes
// back refused for billing WITH a principal, which is how the gateway learns
// the credential is real; an unknown one comes back refused as unauthenticated.
const apiCalls: string[] = [];
const realFetch = globalThis.fetch;
const fakeApi = (async (url: string, init: RequestInit) => {
  apiCalls.push(String(url));
  if (!String(url).endsWith('/admit')) return new Response('not found', { status: 404 });
  const { token } = JSON.parse(String(init.body)) as { token?: string };
  const admission =
    token === 'kortix_real'
      ? {
          ok: false,
          status: 402,
          errorCode: 'subscription_required',
          principal: { accountId: 'acct', role: 'user' },
        }
      : { ok: false, status: 401, errorCode: 'invalid_token', message: 'Invalid token' };
  return Response.json({ admission });
}) as unknown as typeof fetch;
const useFakeApi = () => {
  apiCalls.length = 0;
  globalThis.fetch = fakeApi;
};
afterEach(() => {
  globalThis.fetch = realFetch;
  setSystemTime();
});

const call = (credential: string) =>
  new Request('https://gateway.test/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` },
    body: JSON.stringify({ model: 'x', messages: [] }),
  });

describe('per-credential limit on the gateway route (KRTX-4528)', () => {
  test('a flood of distinct never-validated credentials is refused once the shared allowance is spent', async () => {
    // 2/min is the setting the defect is about: a rotating fake bearer may
    // reach the API twice and must then be refused. On origin/dev each of the
    // five reaches the API under its own bucket.
    setSystemTime(new Date('2026-11-02T12:00:00Z'));
    useFakeApi();
    const { app } = buildServer({ requestsPerMinutePerCredential: 2 });
    const statuses: number[] = [];
    for (let n = 1; n <= 5; n++)
      statuses.push((await app.request(call(`kortix_fake_${n}`))).status);
    expect(statuses).toEqual([401, 401, 429, 429, 429]);
    // The two admitted requests are the two admission calls the fake API saw.
    expect(apiCalls).toHaveLength(2);
  });

  test('a credential the API answers with a principal gets its own budget back', async () => {
    // One pinned minute: a real clock would refill a one-per-minute budget.
    setSystemTime(new Date('2026-11-02T12:00:00Z'));
    useFakeApi();
    const { app } = buildServer({ requestsPerMinutePerCredential: 1 });
    // The first request reaches the fake API, which answers its principal (it
    // also takes the one shared slot, so validation is what gives it back), and
    // from then on the credential has its own budget of one per minute.
    expect((await app.request(call('kortix_real'))).status).toBe(402);
    expect((await app.request(call('kortix_real'))).status).toBe(402);
    expect((await app.request(call('kortix_real'))).status).toBe(429);
    // Its own budget never drains the shared allowance: a fake is still admitted.
    expect((await app.request(call('kortix_fake_1'))).status).toBe(401);
  });

  test('a flood of distinct never-validated x-api-key credentials is refused too', async () => {
    // The Anthropic path takes its credential from `x-api-key` and rewrites it
    // into a bearer BEFORE the pipeline authenticates it, so a key must be
    // validated by the API's answer, never by the route that carried it: a
    // fake x-api-key that marked itself validated would buy a private bucket.
    setSystemTime(new Date('2026-11-02T12:00:00Z'));
    useFakeApi();
    const { app } = buildServer({ requestsPerMinutePerCredential: 2 });
    const statuses: number[] = [];
    for (let n = 1; n <= 5; n++)
      statuses.push(
        (
          await app.request(
            new Request('https://gateway.test/v1/messages', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-api-key': `kortix_xkey_${n}` },
              body: JSON.stringify({ model: 'x', max_tokens: 8, messages: [] }),
            }),
          )
        ).status,
      );
    expect(statuses).toEqual([401, 401, 429, 429, 429]);
    expect(apiCalls).toHaveLength(2);
  });
});
