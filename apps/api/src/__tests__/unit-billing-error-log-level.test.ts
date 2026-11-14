import { afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { OpenAPIHono } from '@hono/zod-openapi';

function setTestEnv(name: string, value: string): void {
  if (!process.env[name] || process.env[name]?.startsWith('encrypted:')) process.env[name] = value;
}
setTestEnv('DATABASE_URL', 'postgres://postgres:postgres@127.0.0.1:54322/postgres');
setTestEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
setTestEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
setTestEnv('API_KEY_SECRET', 'test-api-key-secret');
setTestEnv('TUNNEL_SIGNING_SECRET', 'test-tunnel-signing-secret');
setTestEnv('ALLOWED_SANDBOX_PROVIDERS', 'daytona');
setTestEnv('DAYTONA_API_KEY', 'test-daytona-key');
setTestEnv('DAYTONA_SERVER_URL', 'https://daytona.example.test');
setTestEnv('DAYTONA_TARGET', 'test-target');
setTestEnv('FRONTEND_URL', 'http://localhost:3000');
setTestEnv('INTERNAL_KORTIX_ENV', 'dev');

// KRTX-4918: a BillingError 4xx (e.g. auto-topup validation) is a user-input
// failure and must not log at error level, which the prod error-log anomaly
// source files as an incident. 5xx stays error.
let installHttpErrors: typeof import('../http-errors').installHttpErrors;
let BillingError: typeof import('../errors').BillingError;
let logger: typeof import('../lib/logger').logger;

beforeAll(async () => {
  ({ installHttpErrors } = await import('../http-errors'));
  ({ BillingError } = await import('../errors'));
  ({ logger } = await import('../lib/logger'));
});

function appThrowing(err: Error) {
  const app = new OpenAPIHono();
  installHttpErrors(app);
  app.post('/v1/billing/auto-topup/configure', () => {
    throw err;
  });
  return app;
}

describe('BillingError log level', () => {
  afterEach(() => {
    spyOn(logger, 'warn').mockRestore();
    spyOn(logger, 'error').mockRestore();
  });

  it('logs a 400 BillingError at warn, not error, and keeps the response', async () => {
    const warn = spyOn(logger, 'warn').mockImplementation(() => {});
    const error = spyOn(logger, 'error').mockImplementation(() => {});
    const res = await appThrowing(new BillingError('Auto-topup is only available for paid plans')).request(
      '/v1/billing/auto-topup/configure',
      { method: 'POST' },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Auto-topup is only available for paid plans' });
    expect(warn.mock.calls.map((c) => c[0])).toContain(
      'POST /v1/billing/auto-topup/configure -> 400 [BillingError]',
    );
    expect(error.mock.calls.filter((c) => String(c[0]).includes('[BillingError]'))).toHaveLength(0);
  });

  it('keeps a 5xx BillingError at error', async () => {
    const warn = spyOn(logger, 'warn').mockImplementation(() => {});
    const error = spyOn(logger, 'error').mockImplementation(() => {});
    const res = await appThrowing(new BillingError('stripe down', 502)).request(
      '/v1/billing/auto-topup/configure',
      { method: 'POST' },
    );
    expect(res.status).toBe(502);
    expect(error.mock.calls.map((c) => c[0])).toContain(
      'POST /v1/billing/auto-topup/configure -> 502 [BillingError]',
    );
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('[BillingError]'))).toHaveLength(0);
  });
});
