import { beforeEach, expect, mock, test } from 'bun:test';
import { configureKortix } from '../../http/config';
import { listToolCalls, type ToolCallLogEntry } from './tool-calls';

let calls: string[] = [];
let body: unknown = { tool_calls: [], next_cursor: null };

const ROW: ToolCallLogEntry = {
  execution_id: '00000000-0000-4000-8000-000000000001',
  action_path: 'github.get_issue',
  connector: 'github',
  status: 'denied',
  risk: 'read',
  session_id: null,
  acting_user_id: '00000000-0000-4000-8000-000000000002',
  acting_user_email: 'person@example.com',
  principal_kind: 'agent',
  agent_slug: 'helper',
  credential_id: 'tok-1',
  surface: 'mcp',
  approval_delivery: null,
  refusal_reason: 'policy_block',
  phase: 'policy',
  request_id: 'req-1',
  trace_id: null,
  kortix_ms: 4,
  upstream_ms: null,
  created_at: '2026-11-11T10:00:00.000Z',
  resolved_at: null,
};

beforeEach(() => {
  calls = [];
  body = { tool_calls: [], next_cursor: null };
  configureKortix({ backendUrl: 'http://test.local/v1', getToken: async () => 'tok' });
  globalThis.fetch = mock(async (url: unknown) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
});

test('listToolCalls reads the workspace route with no query when no filter is set', async () => {
  await listToolCalls('ws/1');
  expect(calls[0]).toBe('http://test.local/v1/workspaces/ws%2F1/tool-calls');
});

test('listToolCalls sends every filter under its wire name', async () => {
  await listToolCalls('ws-1', {
    agent: 'helper',
    connector: 'github',
    surface: 'mcp',
    status: 'denied',
    refusalReason: 'policy_block',
    sessionId: 'session-1',
    since: '2026-11-01T00:00:00.000Z',
    until: '2026-11-02T00:00:00.000Z',
    limit: 25,
    cursor: 'abc',
  });
  const url = new URL(calls[0]!);
  expect(url.pathname).toBe('/v1/workspaces/ws-1/tool-calls');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    agent: 'helper',
    connector: 'github',
    surface: 'mcp',
    status: 'denied',
    refusal_reason: 'policy_block',
    session_id: 'session-1',
    since: '2026-11-01T00:00:00.000Z',
    until: '2026-11-02T00:00:00.000Z',
    limit: '25',
    cursor: 'abc',
  });
});

test('listToolCalls returns the rows and the next cursor as the API sent them', async () => {
  body = { tool_calls: [ROW], next_cursor: 'next-1' };
  const page = await listToolCalls('ws-1', { limit: 1 });
  expect(page).toEqual({ tool_calls: [ROW], next_cursor: 'next-1' });
});
