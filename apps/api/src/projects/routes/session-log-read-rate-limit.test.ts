/**
 * Drives the real GET /:projectId/sessions/:sessionId/log handler to prove
 * KRTX-4696: the per-session read guard answers 429 (with `Retry-After`) once a
 * session's log polls pass `KORTIX_SESSION_LOG_READS_PER_MIN`, and other
 * sessions keep reading.
 *
 * Prod 2026-11-10 23:38–23:42 UTC: one CLI client polled the stored log of one
 * session in waves that peaked near 24 requests/s (about 50k requests over one
 * evening against a single session). Each poll pays the full session-read gate
 * plus the page transaction and a multi-100 kB serialize+gzip, so the API's p95
 * for the route hit 2.6 s and the API-wide p95 rose with it. The guard caps the
 * amplification at the handler's front door, before the gate.
 */
import { afterAll, describe, expect, mock, test } from 'bun:test';

const ORIGINAL_ENV = {
  ALLOWED_SANDBOX_PROVIDERS: process.env.ALLOWED_SANDBOX_PROVIDERS,
  FRONTEND_URL: process.env.FRONTEND_URL,
  INTERNAL_KORTIX_ENV: process.env.INTERNAL_KORTIX_ENV,
  SUPABASE_URL: process.env.SUPABASE_URL,
  KORTIX_SESSION_LOG_READS_PER_MIN: process.env.KORTIX_SESSION_LOG_READS_PER_MIN,
};
process.env.ALLOWED_SANDBOX_PROVIDERS = 'daytona';
process.env.FRONTEND_URL = 'https://app.test.kortix.local';
process.env.INTERNAL_KORTIX_ENV = 'dev';
process.env.SUPABASE_URL = 'https://supabase.test.kortix.local';
// Read at module load: must be set before config is (transitively) imported.
process.env.KORTIX_SESSION_LOG_READS_PER_MIN = '3';

const PROJECT_ID = 'd7700000-0000-4000-a000-000000000001';
const SESSION_ID = 'd7800000-0000-4000-a000-000000000001';
const OTHER_SESSION_ID = 'd7800000-0000-4000-a000-000000000002';

mock.module('./lib/route-bindings', () => ({
  resolveSessionBinding: async () => ({
    kind: 'ok',
    loaded: { userId: 'd7900000-0000-4000-a000-000000000001', row: { metadata: {} } },
  }),
}));

mock.module('../lib/access', () => ({
  assertProjectCapability: async () => {},
  loadVisibleSession: async () => ({ row: {} }),
  sessionIsTombstoned: () => false,
}));

mock.module('../session-log-read', () => ({
  readSessionLogPage: async () => ({
    session: {},
    generation: 1,
    threads: [],
    thread_id: 'root',
    messages: [],
    has_more: false,
  }),
}));

const { projectsApp } = await import('../lib/app');
const { registerSessionLogRoutes } = await import('./session-log');
registerSessionLogRoutes();

afterAll(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('GET …/log under the per-session read guard', () => {
  test('polls past the per-session ceiling answer 429 with Retry-After', async () => {
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    let body: Record<string, unknown> | null = null;
    for (let i = 0; i < 5; i += 1) {
      const res = await projectsApp.request(`/${PROJECT_ID}/sessions/${SESSION_ID}/log`);
      statuses.push(res.status);
      if (res.status === 429) {
        retryAfter = res.headers.get('retry-after');
        body = (await res.json()) as Record<string, unknown>;
      } else {
        await res.text();
      }
    }
    // The ceiling is 3 reads/min for this test: the first 3 pass, the rest refuse.
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    expect(body).toMatchObject({ error: 'rate_limit_exceeded' });
    expect(Number(body?.retry_after_seconds)).toBeGreaterThanOrEqual(1);
  });

  test('another session of the same caller keeps reading', async () => {
    const res = await projectsApp.request(`/${PROJECT_ID}/sessions/${OTHER_SESSION_ID}/log`);
    expect(res.status).toBe(200);
    await res.text();
  });
});
