import { afterAll, beforeEach, expect, test } from 'bun:test';
import { type BrowserApi, generatePassword, HISTORY_MAX, type PlatinumBrowser, setBrowserApiForTests, siteOrigin } from './browser';
import { kortixAgentMcpUrl } from './host';
import { dispatchKortixAgentMcp } from './server';
import { type AccountState, encodeAccountState, setAccountStateStoreForTests } from './state';

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
  // Like the database: each change applies to the last stored state, not to the caller's copy.
  setAccountStateStoreForTests(async <D,>(state: AccountState<D>, mutate: (d: D) => D) => {
    const base = (stored?.connectionId === state.connectionId ? stored : state) as AccountState<D>;
    const next = { ...base, data: mutate(base.data) };
    stored = next as AccountState;
    return next;
  });
});
afterAll(() => {
  setBrowserApiForTests(null);
  setAccountStateStoreForTests(null);
});

/** One tool call with the account's current state, as the gateway sends it. */
async function call(name: string, args: Record<string, unknown> = {}, token = encodeAccountState(stored ?? { ...ACCOUNT, data: {} })) {
  const res = await dispatchKortixAgentMcp(new Request(kortixAgentMcpUrl('browser'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const body = (await res.json()) as { result: { structuredContent?: any; isError?: boolean; content: Array<{ text: string }> } };
  return body.result;
}

const outputs: string[] = [];
async function callLogged(name: string, args: Record<string, unknown> = {}) {
  const r = await call(name, args);
  outputs.push(JSON.stringify(r));
  return r;
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
  // Each raw CDP URL handed out is in the history.
  expect((stored!.data as any).history.map((h: { action: string }) => h.action)).toEqual(['connect', 'connect']);
});

test('status never returns the CDP URL', async () => {
  expect((await call('status')).structuredContent).toEqual({ has_browser: false, status: 'none', region: null, sites: 0, logins_backed_up: false });
  await call('connect');
  const status = await call('status');
  expect(status.structuredContent).toMatchObject({ has_browser: true, status: 'running' });
  expect(JSON.stringify(status)).not.toContain('wss://');
});

test('save_login backs logins up and marks known sites; a reset browser comes back from them', async () => {
  await call('remember_site', { site: 'example.test', username: 'otto@example.test', generate_password: true });
  await call('connect');
  const saved = await call('save_login');
  expect(saved.structuredContent).toEqual({ saved: true, cookie_count: 12, sites: ['https://example.test'] });
  expect(stored!.data).toMatchObject({ browserId: 'br_1', profileId: 'prof_1', sites: { 'https://example.test': { savedAt: expect.any(String) } } });

  expect((await call('reset', {})).isError).toBe(true);
  expect((await call('reset', { confirm: 'reset' })).structuredContent).toEqual({ reset: true, logins_backed_up: true });
  expect(calls).toContain('remove br_1');
  const after = stored!.data as any;
  expect(after.browserId).toBeUndefined();
  expect(after.profileId).toBe('prof_1');
  expect(Object.keys(after.sites)).toEqual(['https://example.test']);

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

test('a stored password is never returned by any tool', async () => {
  const remembered = await callLogged('remember_site', { site: 'https://Accounts.Example.test/signin?x=1', username: 'otto@example.test', generate_password: true, notes: 'free plan' });
  expect(remembered.structuredContent).toMatchObject({ site: 'https://accounts.example.test', username: 'otto@example.test', has_password: true, notes: 'free plan', password_generated: true });
  const password = (stored!.data as any).sites['https://accounts.example.test'].password as string;
  expect(password).toHaveLength(20);

  await callLogged('remember_site', { site: 'accounts.example.test', signed_in: true });
  const listed = await callLogged('sites');
  expect(listed.structuredContent.sites).toEqual([
    expect.objectContaining({ site: 'https://accounts.example.test', username: 'otto@example.test', has_password: true, signed_in_at: expect.any(String) }),
  ]);
  await callLogged('history');
  await callLogged('status');
  for (const out of outputs) expect(out).not.toContain(password);

  expect((await call('forget_site', { site: 'https://accounts.example.test' })).structuredContent).toEqual({ forgot: 'https://accounts.example.test' });
  expect((stored!.data as any).sites).toEqual({});
});

test('two sessions writing at once both land', async () => {
  const token = encodeAccountState({ ...ACCOUNT, data: {} });
  // Both calls carry the same, soon stale, credential: the store applies each to the latest state.
  await Promise.all([
    call('remember_site', { site: 'one.example.test', username: 'a' }, token),
    call('remember_site', { site: 'two.example.test', username: 'b' }, token),
  ]);
  expect(Object.keys((stored!.data as any).sites).sort()).toEqual(['https://one.example.test', 'https://two.example.test']);
});

test('history is newest first, filters by site, and keeps the last HISTORY_MAX', async () => {
  const history = Array.from({ length: HISTORY_MAX + 5 }, (_, n) => ({ at: `2026-11-27T10:00:${String(n % 60).padStart(2, '0')}Z`, action: 'open', url: n % 2 ? `https://a.example.test/${n}` : `https://b.example.test/${n}`, title: `p${n}`, status: 200 }));
  stored = { ...ACCOUNT, data: { history } };
  const a = await call('history', { site: 'a.example.test', limit: 2 });
  expect(a.structuredContent.history.map((h: { title: string }) => h.title)).toEqual([`p${HISTORY_MAX + 3}`, `p${HISTORY_MAX + 1}`]);
  await call('connect');
  expect((stored!.data as any).history).toHaveLength(HISTORY_MAX);
  expect((stored!.data as any).history.at(-1).action).toBe('connect');
});

test('siteOrigin and generatePassword', () => {
  expect(siteOrigin('GitHub.com/login')).toBe('https://github.com');
  expect(siteOrigin('http://localhost:3000/x')).toBe('http://localhost:3000');
  expect(() => siteOrigin('ftp://example.test')).toThrow('not a site address');
  for (let n = 0; n < 20; n++) {
    const p = generatePassword();
    expect(p).toHaveLength(20);
    expect(p).toMatch(/[A-Z]/);
    expect(p).toMatch(/[a-z]/);
    expect(p).toMatch(/[0-9]/);
    expect(p).toMatch(/[!@#%^*\-_=+]/);
  }
});
