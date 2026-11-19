import { afterEach, expect, test } from 'bun:test';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureKortix } from '../core/http/config';
import { KortixWorkspaceProvider } from './route-project';
import { useSessionModelSelection, type SessionModelSelection } from './use-session-model-selection';
import { runIdentityResets } from './identity-reset-registry';
import type { Model } from '../core/runtime/runtime-types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function model(id: string): Model {
  const modalities = { text: true, audio: false, image: false, video: false, pdf: false };
  return { id, name: id, providerID: 'kortix', api: { id, url: '', npm: '' },
    capabilities: { temperature: false, reasoning: false, attachment: false, toolcall: true, input: modalities, output: modalities, interleaved: false },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } }, limit: { context: 1000, output: 100 },
    status: 'active', options: {}, headers: {}, release_date: '2026-01-01' };
}
const originalFetch = globalThis.fetch;
let root: ReactTestRenderer | undefined;
let selection: SessionModelSelection | undefined;
const writes: unknown[] = [];
let rejectWrite = false;
const errors: string[] = [];
function Probe() {
  selection = useSessionModelSelection({ sessionId: 'synthetic-session', providers: {
    all: [{ id: 'kortix', name: 'Kortix', source: 'custom', env: [], options: {}, models: { 'model-a': model('model-a'), 'model-b': model('model-b') } }],
    connected: ['kortix'], default: { kortix: 'model-a' },
  } });
  return null;
}
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  selection = undefined;
  globalThis.fetch = originalFetch;
  writes.length = 0;
  errors.length = 0;
  rejectWrite = false;
  runIdentityResets();
});

test('an intentional composer pick writes the same durable model API as the CLI; automatic seeds do not', async () => {
  configureKortix({ backendUrl: 'http://synthetic.local/v1', getToken: async () => 'synthetic-token', onToast: (_level, message) => { errors.push(message); } });
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === 'PUT') {
      writes.push({ path: new URL(request.url).pathname, body: await request.json() });
      return rejectWrite
        ? Response.json({ error: 'Model selection refused' }, { status: 403 })
        : Response.json({ model: 'kortix/model-b', applied_live: true });
    }
    return Response.json({ accountDefault: null, projectDefault: null, platformDefault: 'kortix/model-a', agentDefaults: {}, freeTier: false });
  }, { preconnect: originalFetch.preconnect });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await act(async () => {
    root = create(createElement(QueryClientProvider, { client }, createElement(KortixWorkspaceProvider, { projectId: 'synthetic-project' }, createElement(Probe))));
  });
  await act(async () => { selection?.model.set({ providerID: 'kortix', modelID: 'model-a' }, { autoSeed: true }); });
  expect(writes).toEqual([]);
  await act(async () => { selection?.model.set({ providerID: 'kortix', modelID: 'model-b' }, { recent: true }); });
  expect(writes).toEqual([{ path: '/v1/workspaces/synthetic-project/sessions/synthetic-session/model', body: { model: 'model-b' } }]);
  expect(selection?.model.sendKey).toEqual({ providerID: 'kortix', modelID: 'model-b' });
  rejectWrite = true;
  await act(async () => { selection?.model.set({ providerID: 'kortix', modelID: 'model-a' }, { recent: true }); });
  expect(selection?.model.sendKey).toEqual({ providerID: 'kortix', modelID: 'model-b' });
  expect(errors).toHaveLength(1);
  client.clear();
});
