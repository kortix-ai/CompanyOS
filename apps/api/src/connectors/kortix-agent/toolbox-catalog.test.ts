import { afterAll, beforeEach, expect, test } from 'bun:test';

let ledger: string[] = [];

const { kortixAgentMcpUrl, KORTIX_SESSION_HEADER } = await import('./host');
const { dispatchKortixAgentMcp } = await import('./server');
const { encodeAccountState } = await import('./state');
const { setTregApiForTests, tregMeta } = await import('./treg');
const { CATALOG_CALL_MAX_USD, setCatalogBillingForTests } = await import('./toolbox');
type TregApi = import('./treg').TregApi;
type TregEndpoint = import('./treg').TregEndpoint;

const PROJECT = '4f2a9c1e-1111-4222-8333-944445555666';
const SESSION = '9a0b1c2d-0000-4000-8000-00000000000a';
const TOKEN = encodeAccountState({ projectId: PROJECT, connectorId: '0f0e0d0c-0000-4000-8000-000000000001', connectionId: '0f0e0d0c-0000-4000-8000-000000000006', service: 'toolbox', data: {} });

const tool = (id: string, extra: Partial<TregEndpoint> = {}): TregEndpoint => ({
  id, name: id, summary: `does ${id}`, method: 'GET', kind: 'data', scope: 'any_account', platform_eligible: true, async: null, cost: { type: 'per_call', usd: 0.002 }, ...extra,
});
const CATALOG = [
  tool('hunter.people.email.find'),
  tool('google-ads.query', { scope: 'own_account', platform_eligible: false }),
  tool('video.gen', { async: { poll: true } }),
  tool('unpriced.thing', { cost: null }),
  tool('treg.people.email.find', { method: 'POST', kind: 'routed', cost: { type: 'per_success', usd: 0.00095 } }),
];

let calls: Array<Parameters<TregApi['call']>[0]>;
let answer: () => Awaited<ReturnType<TregApi['call']>>;

beforeEach(() => {
  ledger = [];
  // Billing and the workspace's account are the database's; here they are recorded.
  setCatalogBillingForTests({
    accountOf: async () => 'acct-synthetic',
    reserve: async (_account, cost) => {
      ledger.push(`hold ${cost.toFixed(4)}`);
      return { accountId: 'acct-synthetic', billingToolName: 'toolbox_catalog', cost };
    },
    settle: async (_hold, actual) => {
      ledger.push(`settle ${actual.toFixed(4)}`);
    },
  });
  calls = [];
  answer = () => ({ status: 200, body: { email: 'otto@example.test' }, costMicro: 2000, callId: 'call_1' });
  setTregApiForTests({
    search: async () => CATALOG,
    get: async (id) => CATALOG.find((e) => e.id === id) ?? null,
    call: async (input) => {
      calls.push(input);
      return answer();
    },
  });
});
afterAll(() => {
  setTregApiForTests(null);
  setCatalogBillingForTests(null);
});

async function call(name: string, args: Record<string, unknown>) {
  const res = await dispatchKortixAgentMcp(new Request(kortixAgentMcpUrl('toolbox'), {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, [KORTIX_SESSION_HEADER]: SESSION },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  return ((await res.json()) as { result: { structuredContent?: any; isError?: boolean; content: Array<{ text: string }> } }).result;
}

test('find_tools offers only tools treg serves on its own keys, priced in credits', async () => {
  const r = await call('find_tools', { query: 'find a work email' });
  expect(r.structuredContent.tools.map((t: { id: string }) => t.id)).toEqual(['hunter.people.email.find', 'treg.people.email.find']);
  expect(r.structuredContent.tools[0]).toMatchObject({ credits_per_call: 0.3, method: 'GET' });
  expect(JSON.stringify(r)).not.toContain('$');
});

test('describe_tool refuses a tool on the customer\'s own account and points to connectors', async () => {
  const r = await call('describe_tool', { id: 'google-ads.query' });
  expect(r.isError).toBe(true);
  expect(r.content[0]!.text).toContain('regular connector');
  expect((await call('describe_tool', { id: 'video.gen' })).isError).toBe(true);
});

test('call_tool holds the estimate, settles on the real cost, and tags the workspace', async () => {
  const r = await call('call_tool', { id: 'hunter.people.email.find', query: { domain: 'example.test', limit: 3 } });
  expect(r.structuredContent).toEqual({ id: 'hunter.people.email.find', status: 200, ok: true, credits: 0.3, result: { email: 'otto@example.test' } });
  expect(calls[0]).toMatchObject({ id: 'hunter.people.email.find', method: 'GET', query: { domain: 'example.test', limit: '3' }, maxCostUsd: CATALOG_CALL_MAX_USD });
  expect(calls[0]!.meta).toBe(`workspace=${PROJECT}, session=${SESSION}, product=kortix-toolbox`);
  expect(ledger).toEqual(['hold 0.0030', 'settle 0.0030']);
});

test('a failed call settles at zero; a provider error is returned, billed at what treg charged', async () => {
  answer = () => {
    throw new Error('network down');
  };
  expect((await call('call_tool', { id: 'hunter.people.email.find' })).isError).toBe(true);
  expect(ledger).toEqual(['hold 0.0030', 'settle 0.0000']);

  ledger = [];
  answer = () => ({ status: 404, body: { message: 'no result' }, costMicro: 0, callId: 'call_2' });
  const r = await call('call_tool', { id: 'hunter.people.email.find' });
  expect(r.structuredContent).toMatchObject({ ok: false, status: 404, credits: 0 });
  expect(ledger).toEqual(['hold 0.0030', 'settle 0.0000']);
});

test('the meta tag keeps only characters treg accepts', () => {
  expect(tregMeta({ workspaceId: 'ws 1/<x>', sessionId: null })).toBe('workspace=ws1x, product=kortix-toolbox');
});
