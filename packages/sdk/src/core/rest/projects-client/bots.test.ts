import { beforeEach, expect, mock, test } from 'bun:test';
import { ApiError } from '../../http/api/errors';
import { configureKortix } from '../../http/config';
import { listWorkspaceBots, setWorkspaceBotPaused, type WorkspaceBot } from './bots';

let calls: { url: string; method: string }[] = [];
let nextResponse: { status: number; body: unknown } = { status: 200, body: {} };

beforeEach(() => {
  calls = [];
  globalThis.fetch = mock(async (url: unknown, opts: { method?: string } = {}) => {
    calls.push({ url: String(url), method: opts.method ?? 'GET' });
    return new Response(JSON.stringify(nextResponse.body), {
      status: nextResponse.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  configureKortix({ backendUrl: 'http://test.local/v1', getToken: async () => 'tok' });
});

const marketing: WorkspaceBot = {
  name: 'marketing',
  display_name: 'marketing',
  model: null,
  status: 'active',
  is_default: true,
  builtin: false,
  chat_space_id: null,
};

test('listWorkspaceBots GETs the bots route and returns the array', async () => {
  nextResponse = { status: 200, body: { bots: [marketing] } };
  const bots = await listWorkspaceBots('P1');
  expect(calls).toEqual([{ url: 'http://test.local/v1/workspaces/P1/bots', method: 'GET' }]);
  expect(bots).toEqual([marketing]);
});

test('listWorkspaceBots rejects with feature_disabled while kortix_bot is off and never reaches the host error handler', async () => {
  const errors: unknown[] = [];
  configureKortix({ backendUrl: 'http://test.local/v1', getToken: async () => 'tok', onError: (e: unknown) => errors.push(e) });
  nextResponse = { status: 403, body: { error: 'Feature disabled', code: 'feature_disabled', feature: 'kortix_bot' } };
  const error = await listWorkspaceBots('P1').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 403, code: 'feature_disabled' });
  expect(errors).toEqual([]);
});

test('setWorkspaceBotPaused POSTs { paused } to the bot pause route and returns the bot', async () => {
  nextResponse = { status: 200, body: { bot: { ...marketing, status: 'paused' }, stopped_sessions: 2 } };
  const result = await setWorkspaceBotPaused('P1', 'marketing', true);
  expect(calls).toEqual([{ url: 'http://test.local/v1/workspaces/P1/bots/marketing/pause', method: 'POST' }]);
  expect(result.bot.status).toBe('paused');
  expect(result.stopped_sessions).toBe(2);
});
