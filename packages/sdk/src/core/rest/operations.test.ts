import { beforeEach, expect, mock, test } from 'bun:test';
import { configureKortix } from '../http/config';
import { callOperation, listOperations } from './operations';

let calls: { url: string; method: string; body: unknown }[] = [];
let nextResponse: { status: number; body: unknown } = { status: 200, body: {} };

beforeEach(() => {
  calls = [];
  nextResponse = { status: 200, body: {} };
  globalThis.fetch = mock(async (url: unknown, opts: { method?: string; body?: string } = {}) => {
    calls.push({ url: String(url), method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : undefined });
    return new Response(JSON.stringify(nextResponse.body), { status: nextResponse.status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
});

configureKortix({ backendUrl: 'http://test.local', getToken: async () => 'tok' });
const last = () => calls[calls.length - 1]!;

test('listOperations names every operation a client may call, with its method, path and IAM action', () => {
  const ops = listOperations();
  const set = ops.find((op) => op.id === 'secrets.set');
  expect(set).toMatchObject({ method: 'POST', path: '/workspaces/:workspaceId/secrets', action: 'project.secret.write', exposure: 'agent' });
  expect(set!.parameters).toContainEqual({ name: 'workspaceId', in: 'path', required: true });
  expect(set!.body).toBe(true);
  // Webhooks, sandbox callbacks and platform admin are no client's to call.
  expect(ops.some((op) => op.exposure === ('internal' as never))).toBe(false);
  expect(new Set(ops.map((op) => op.id)).size).toBe(ops.length);
});

test('callOperation fills and encodes path parameters and sends `body` as JSON', async () => {
  nextResponse = { status: 200, body: { name: 'K' } };
  expect(await callOperation<Record<string, unknown>>('secrets.set', { workspaceId: 'w 1', body: { name: 'K', value: 'v' } })).toEqual({ name: 'K' });
  expect(last()).toEqual({ url: 'http://test.local/workspaces/w%201/secrets', method: 'POST', body: { name: 'K', value: 'v' } });

  await callOperation('secrets.delete', { workspaceId: 'w1', name: 'A/B' });
  expect(last().url).toBe('http://test.local/workspaces/w1/secrets/A%2FB');
  expect(last().method).toBe('DELETE');
});

test('callOperation sends every other argument as a query parameter', async () => {
  nextResponse = { status: 200, body: { sessions: [] } };
  await callOperation('sessions.list', { workspaceId: 'w1', limit: 5 });
  const url = new URL(last().url);
  expect(url.pathname).toBe('/workspaces/w1/sessions');
  expect(url.searchParams.get('limit')).toBe('5');
});

test('a held call answers its pending approval instead of throwing', async () => {
  nextResponse = { status: 202, body: { status: 'pending_approval', execution_id: 'e1', runs_on_approval: true } };
  expect(await callOperation<Record<string, unknown>>('secrets.set', { workspaceId: 'w1', body: { name: 'K', value: 'v' } })).toEqual({
    status: 'pending_approval',
    execution_id: 'e1',
    runs_on_approval: true,
  });
});

test('an unknown operation, a missing path parameter or an API error throws', async () => {
  await expect(callOperation('no.such.operation' as never, {})).rejects.toThrow('Unknown Kortix operation "no.such.operation"');
  await expect(callOperation('secrets.delete', { workspaceId: 'w1' })).rejects.toThrow('"secrets.delete" needs "name"');
  nextResponse = { status: 403, body: { error: 'nope', code: 'policy_block' } };
  await expect(callOperation('secrets.set', { workspaceId: 'w1', body: {} })).rejects.toThrow();
});
