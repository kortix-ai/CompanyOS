/**
 * KRTX-4372: `GET /v1/usage/session-costs` answers 429 (with `Retry-After`) once
 * one caller passes `KORTIX_SESSION_COSTS_READS_PER_MIN`, before any account
 * resolution or query, and another caller keeps reading.
 *
 * Prod 2026-11-13 22:10 UTC: one CLI client sent about 140 requests in three
 * minutes; each ran four aggregate queries, starved the DB pool for the 25 s
 * request deadline and produced 276 5xx on the route plus 5xx on unrelated routes.
 */
import { describe, expect, mock, test } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

// Read at config load: must be set before usage.ts is imported.
process.env.KORTIX_SESSION_COSTS_READS_PER_MIN = '3';

const realAuthorize = await import('../../iam/authorize');

const ACCOUNT_ID = '00000000-0000-4000-a000-000000000001';
let callerId = 'user-a';
let listCalls = 0;

interface TestContext {
  set(key: string, value: unknown): void;
}

mock.module('../../middleware/auth', () => ({
  combinedAuth: async (c: TestContext, next: () => Promise<void>) => {
    c.set('userId', callerId);
    c.set('authType', 'supabase');
    await next();
  },
}));
mock.module('../../middleware/resolve-account', () => ({
  resolveScopedAccountId: async () => ACCOUNT_ID,
}));
mock.module('../../iam/authorize', () => ({
  ...realAuthorize,
  assertAuthorized: async () => {},
  authorize: async () => ({ allowed: true }),
}));
mock.module('../../shared/session-costs', () => ({
  listSessionCosts: async (input: Record<string, unknown>) => {
    listCalls += 1;
    return { sessions: [], total: 0, limit: input.limit, offset: 0, next_offset: null, reconciliation: {} };
  },
  getSessionCostRecord: async () => null,
  billedComputeSecondsExpression: 0,
}));

const { usageApp } = await import('./usage');

const app = new Hono();
app.route('/v1/usage', usageApp);
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  throw error;
});

describe('GET /v1/usage/session-costs per-caller read ceiling', () => {
  test('answers 429 with Retry-After past the limit, before querying, and spares other callers', async () => {
    callerId = 'user-a';
    for (let i = 0; i < 3; i++) {
      expect((await app.request('/v1/usage/session-costs')).status).toBe(200);
    }
    expect(listCalls).toBe(3);

    const denied = await app.request('/v1/usage/session-costs?format=csv');
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = (await denied.json()) as { error: string; retry_after_seconds: number };
    expect(body.error).toBe('rate_limit_exceeded');
    expect(body.retry_after_seconds).toBeGreaterThan(0);
    expect(listCalls).toBe(3);

    callerId = 'user-b';
    expect((await app.request('/v1/usage/session-costs')).status).toBe(200);
    expect(listCalls).toBe(4);
  });
});
