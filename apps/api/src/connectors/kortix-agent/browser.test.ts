import { afterAll, beforeEach, expect, test } from 'bun:test';
import { type BrowserApi, type PlatinumBrowser, setBrowserApiForTests } from './browser';
import { kortixAgentMcpUrl } from './host';
import { dispatchKortixAgentMcp } from './server';
import { type AccountState, encodeAccountState, setAccountStatePersistForTests } from './state';

const ACCOUNT = { projectId: '4f2a9c1e-1111-4222-8333-944445555666', connectorId: '0f0e0d0c-0000-4000-8000-000000000001', connectionId: '0f0e0d0c-0000-4000-8000-000000000003', service: 'browser' as const };

let stored: AccountState | null;
let browsers: Map<string, PlatinumBrowser>;
let calls: string[];
let creates: Array<Parameters<BrowserApi['create']>[0]>;

const fake: BrowserApi = {
  async create(input) {
    creates.push(input);
    const b = { id: `br_${browsers.size + 1}`, status: 'running', region: 'eu-west' };
    browsers.set(b.id, b);
    return b;
  },
  async get(id) {
    return browsers.get(id) ?? null;
  },
  async resume(id) {
    calls.push(`resume ${id}`);
    const b = { ...browsers.get(id)!, status: 'running' };
    browsers.set(id, b);
    return b;
  },
  async pause(id) {
    calls.push(`pause ${id}`);
    browsers.set(id, { ...browsers.get(id)!, status: 'paused' });
  },
  async cdpUrl(id, ttl) {
    calls.push(`cdp ${id} ${ttl}`);
    return { cdp_url: `wss://browsers.example.test/${id}?token=t`, expires_at: '2026-11-27T17:00:00Z' };
  },
  async createProfile(name) {
    calls.push(`profile ${name}`);
    return { id: 'prof_1' };
  },
  async saveProfile(id, profileId) {
    calls.push(`save ${id} ${profileId}`);
    return { cookie_count: 12, origins: ['https://example.test'] };
  },
  async remove(id) {
    calls.push(`remove ${id}`);
    browsers.delete(id);
  },
};

beforeEach(() => {
  stored = null;
  browsers = new Map();
  calls = [];
  creates = [];
  setBrowserApiForTests(fake);
  setAccountStatePersistForTests(async (state) => {
    stored = state;
  });
});
afterAll(() => {
  setBrowserApiForTests(null);
  setAccountStatePersistForTests(null);
});

/** One tool call with the account's current state, as the gateway sends it. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const token = encodeAccountState(stored ?? { ...ACCOUNT, data: {} });
  const res = await dispatchKortixAgentMcp(new Request(kortixAgentMcpUrl('browser'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const body = (await res.json()) as { result: { structuredContent?: any; isError?: boolean; content: Array<{ text: string }> } };
  return body.result;
}

test('connect creates the browser once, then reuses it and wakes it from a pause', async () => {
  const first = await call('connect');
  expect(first.structuredContent).toMatchObject({ status: 'running', cdp_url: 'wss://browsers.example.test/br_1?token=t' });
  expect(stored!.data).toMatchObject({ browserId: 'br_1' });
  expect(creates).toHaveLength(1);
  expect(creates[0]).toMatchObject({ idleTimeoutMinutes: 30, idempotencyKey: `kortix-browser-${ACCOUNT.connectionId}-first` });

  await call('pause');
  expect(browsers.get('br_1')!.status).toBe('paused');
  const again = await call('connect', { ttl_seconds: 99_999 });
  expect(again.structuredContent.status).toBe('running');
  expect(creates).toHaveLength(1);
  expect(calls).toContain('resume br_1');
  expect(calls).toContain('cdp br_1 3600');
});

test('status never returns the CDP URL', async () => {
  expect((await call('status')).structuredContent).toEqual({ has_browser: false, status: 'none', logins_backed_up: false });
  await call('connect');
  const status = await call('status');
  expect(status.structuredContent).toMatchObject({ has_browser: true, status: 'running' });
  expect(JSON.stringify(status)).not.toContain('wss://');
});

test('save_login backs logins up; a reset browser comes back from them', async () => {
  await call('connect');
  const saved = await call('save_login');
  expect(saved.structuredContent).toEqual({ saved: true, cookie_count: 12, sites: ['https://example.test'] });
  expect(stored!.data).toMatchObject({ browserId: 'br_1', profileId: 'prof_1' });

  expect((await call('reset', {})).isError).toBe(true);
  expect((await call('reset', { confirm: 'reset' })).structuredContent).toEqual({ reset: true, logins_backed_up: true });
  expect(calls).toContain('remove br_1');
  expect(stored!.data).toEqual({ profileId: 'prof_1' });

  await call('connect');
  expect(creates).toHaveLength(2);
  expect(creates[1]).toMatchObject({ profileId: 'prof_1' });
});

test('a browser Platinum lost is replaced with a new idempotency key', async () => {
  await call('connect');
  browsers.set('br_1', { id: 'br_1', status: 'failed' });
  await call('connect');
  expect(creates[1]!.idempotencyKey).toBe(`kortix-browser-${ACCOUNT.connectionId}-br_1`);
  expect(stored!.data).toMatchObject({ browserId: 'br_2' });
});

test('pause with no browser is a tool error', async () => {
  const r = await call('pause');
  expect(r.isError).toBe(true);
  expect(r.content[0]!.text).toContain('no browser yet');
});
