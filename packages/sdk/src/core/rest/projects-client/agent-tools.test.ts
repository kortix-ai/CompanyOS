import { beforeEach, expect, mock, test } from 'bun:test';
import { ApiError } from '../../http/api/errors';
import { configureKortix } from '../../http/config';
import { createKortix } from '../../client/kortix';
import { AGENT_TOOLS_SURFACE_HEADER, createAgentToolsClient } from './agent-tools';

interface Reply {
  status?: number;
  body?: unknown;
}

let requests: Array<{ url: string; method: string; body: any; headers: Headers }> = [];
let next: Reply = {};

beforeEach(() => {
  requests = [];
  next = {};
  configureKortix({ backendUrl: 'http://test.local/v1', getToken: async () => 'token' });
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: request.url,
      method: request.method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: new Headers(init?.headers ?? request.headers),
    });
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
});

async function rejection(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

// ── Request shape ───────────────────────────────────────────────────────────

test('search posts the query to the verb route of the project, as surface api by default', async () => {
  next = { body: { results: [], truncated: false, next: 'describe an id' } };
  await createAgentToolsClient({ projectId: 'proj 1' }).search({ query: 'echo', family: 'connectors', limit: 5 });
  expect(requests[0]!.method).toBe('POST');
  expect(requests[0]!.url).toBe('http://test.local/v1/agent-tools/search?project_id=proj%201');
  expect(requests[0]!.body).toEqual({ query: 'echo', family: 'connectors', limit: 5 });
  expect(requests[0]!.headers.get('x-kortix-surface')).toBe('api');
  expect(AGENT_TOOLS_SURFACE_HEADER).toBe('x-kortix-surface');
});

test('the surface is configurable and the project query is omitted without a project', async () => {
  next = { body: { results: [], truncated: false, next: '' } };
  await createAgentToolsClient({ surface: 'cli' }).search({ query: 'x' });
  expect(requests[0]!.url).toBe('http://test.local/v1/agent-tools/search');
  expect(requests[0]!.body).toEqual({ query: 'x' });
  expect(requests[0]!.headers.get('x-kortix-surface')).toBe('cli');
});

test('every verb posts its documented body', async () => {
  const tools = createAgentToolsClient({ projectId: 'p' });
  next = { body: { text: '# kortix-system' } };
  await tools.skills({ name: 'kortix-system', file: 'references/cli.md' });
  next = { body: { id: 'a.b', title: 't', description: 'd', risk: 'read', input_schema: null, output_schema: null } };
  await tools.describe('kortix.GET /v1/projects/{id}');
  next = { body: { status: 'ok', data: 1 } };
  await tools.call('connectors.echo.read_echo', { text: 'hi' });
  await tools.call('connectors.echo.read_echo');
  next = { body: { ok: true, value: 3, calls: 0 } };
  await tools.execute('return 1 + 2;');
  next = { body: { execution_id: 'e', state: 'pending' } };
  await tools.resume('0b5c1b8e-0000-4000-8000-000000000000');
  expect(requests.map((r) => [new URL(r.url).pathname, r.body])).toEqual([
    ['/v1/agent-tools/skills', { name: 'kortix-system', file: 'references/cli.md' }],
    ['/v1/agent-tools/describe', { id: 'kortix.GET /v1/projects/{id}' }],
    ['/v1/agent-tools/call', { id: 'connectors.echo.read_echo', input: { text: 'hi' } }],
    ['/v1/agent-tools/call', { id: 'connectors.echo.read_echo', input: {} }],
    ['/v1/agent-tools/execute', { code: 'return 1 + 2;' }],
    ['/v1/agent-tools/resume', { execution_id: '0b5c1b8e-0000-4000-8000-000000000000' }],
  ]);
});

// ── Results ─────────────────────────────────────────────────────────────────

test('call returns ok and pending_approval results as typed unions', async () => {
  const tools = createAgentToolsClient({ projectId: 'p' });
  next = { body: { status: 'ok', data: { echo: 'hi' } } };
  const ok = await tools.call('connectors.echo.read_echo', { text: 'hi' });
  expect(ok).toEqual({ status: 'ok', data: { echo: 'hi' } });

  next = {
    body: {
      status: 'pending_approval',
      execution_id: 'e1',
      approval_url: 'http://web/review/e1',
      runs_on_approval: true,
      next: 'A person approves it.',
    },
  };
  const held = await tools.call('connectors.echo.post_echo', { text: 'hi' });
  expect(held.status).toBe('pending_approval');
  if (held.status === 'pending_approval') {
    expect(held.execution_id).toBe('e1');
    expect(held.approval_url).toBe('http://web/review/e1');
    expect(held.runs_on_approval).toBe(true);
  }
});

test('a tool-reported failure (HTTP 422) is a result, not a thrown error', async () => {
  const tools = createAgentToolsClient({ projectId: 'p' });
  next = { status: 422, body: { status: 'denied', reason: 'policy_block', message: 'blocked', data: null } };
  expect(await tools.call('connectors.echo.post_echo', {})).toEqual({
    status: 'denied',
    reason: 'policy_block',
    message: 'blocked',
    data: null,
  });

  next = { status: 422, body: { error: 'unknown tool', suggestions: ['connectors.echo.read_echo'] } };
  expect(await tools.describe('connectors.echo.read_echoo')).toEqual({
    error: 'unknown tool',
    suggestions: ['connectors.echo.read_echo'],
  });

  next = { status: 422, body: { ok: false, error: { kind: 'runtime', message: 'boom' }, calls: 1 } };
  expect(await tools.execute('throw new Error("boom")')).toEqual({
    ok: false,
    error: { kind: 'runtime', message: 'boom' },
    calls: 1,
  });
});

test('a 422 without the verb result shape throws an ApiError with the server text', async () => {
  next = { status: 422, body: { text: 'HTTP 404\n{"error":"not found"}' } };
  const err = await rejection(createAgentToolsClient({ projectId: 'p' }).resume('0b5c1b8e-0000-4000-8000-000000000000'));
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(422);
  expect(err.message).toContain('HTTP 404');
});

test('invalid input (HTTP 400) throws an ApiError with code invalid_input', async () => {
  next = { status: 400, body: { error: 'invalid_input', message: 'query is required' } };
  const err = await rejection(createAgentToolsClient().search({ query: '' }));
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(400);
});

// ── Facade ──────────────────────────────────────────────────────────────────

test('kortix.agentTools() and kortix.project(id).agentTools() reach the same verbs', async () => {
  const kortix = createKortix({ backendUrl: 'http://test.local/v1', getToken: async () => 'token' });
  next = { body: { results: [], truncated: false, next: '' } };
  await kortix.agentTools({ surface: 'app' }).search({ query: 'a' });
  await kortix.project('pid').agentTools().search({ query: 'b' });
  await kortix.project('pid').agentTools({ surface: 'cli' }).search({ query: 'c' });
  expect(requests.map((r) => [r.url, r.headers.get('x-kortix-surface')])).toEqual([
    ['http://test.local/v1/agent-tools/search', 'app'],
    ['http://test.local/v1/agent-tools/search?project_id=pid', 'api'],
    ['http://test.local/v1/agent-tools/search?project_id=pid', 'cli'],
  ]);
});
