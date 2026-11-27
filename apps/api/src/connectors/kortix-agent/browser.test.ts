import { afterAll, beforeEach, expect, test } from 'bun:test';
import { type BrowserApi, COPIES_MAX, generatePassword, mergeSiteState, type PlatinumBrowser, setBrowserApiForTests, siteOrigin, type StorageState } from './browser';
import { KORTIX_SESSION_HEADER, kortixAgentMcpUrl } from './host';
import { dispatchKortixAgentMcp } from './server';
import { type AccountState, encodeAccountState, setAccountStateStoreForTests } from './state';

const ACCOUNT = { projectId: '4f2a9c1e-1111-4222-8333-944445555666', connectorId: '0f0e0d0c-0000-4000-8000-000000000001', connectionId: '0f0e0d0c-0000-4000-8000-000000000003', service: 'browser' as const };
const SESSION_A = '9a0b1c2d-0000-4000-8000-00000000000a';
const SESSION_B = '9a0b1c2d-0000-4000-8000-00000000000b';

const cookie = (name: string, domain: string, value = 'v') => ({ name, value, domain, path: '/' });
const empty = (): StorageState => ({ cookies: [], origins: [] });

let stored: AccountState | null;
let browsers: Map<string, PlatinumBrowser>;
/** What each running browser holds, for save-profile to capture. */
let live: Map<string, StorageState>;
let profiles: Map<string, StorageState>;
let calls: string[];
let creates: Array<Parameters<BrowserApi['create']>[0]>;

const fake: BrowserApi = {
  async create(input) {
    creates.push(input);
    const b = { id: `br_${creates.length}`, status: 'running', region: 'eu-west' };
    browsers.set(b.id, b);
    live.set(b.id, structuredClone(input.profileId ? (profiles.get(input.profileId) ?? empty()) : empty()));
    return b;
  },
  async get(id) {
    return browsers.get(id) ?? null;
  },
  async resume(id) {
    calls.push(`resume ${id}`);
    browsers.set(id, { ...browsers.get(id)!, status: 'running' });
    return browsers.get(id)!;
  },
  async cdpUrl(id, ttl) {
    calls.push(`cdp ${id} ${ttl}`);
    return { cdp_url: `wss://browsers.example.test/${id}?token=t`, expires_at: '2026-11-27T17:00:00Z' };
  },
  async remove(id) {
    calls.push(`remove ${id}`);
    browsers.delete(id);
  },
  async createProfile(name) {
    const id = `prof_${profiles.size + 1}`;
    calls.push(`profile ${name}`);
    profiles.set(id, empty());
    return { id };
  },
  async deleteProfile(id) {
    calls.push(`delete profile ${id}`);
    profiles.delete(id);
  },
  async saveProfile(browserId, profileId) {
    const state = structuredClone(live.get(browserId)!);
    profiles.set(profileId, state);
    return { cookie_count: state.cookies.length, origins: state.origins.map((o) => o.origin) };
  },
  async getState(profileId) {
    return structuredClone(profiles.get(profileId)!);
  },
  async putState(profileId, state) {
    profiles.set(profileId, structuredClone(state));
  },
};

beforeEach(() => {
  stored = null;
  browsers = new Map();
  live = new Map();
  profiles = new Map();
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

/** One tool call from `session`, with the account's current state, as the gateway sends it. */
async function call(name: string, args: Record<string, unknown> = {}, session: string | null = SESSION_A) {
  const token = encodeAccountState(stored ?? { ...ACCOUNT, data: {} });
  const res = await dispatchKortixAgentMcp(new Request(kortixAgentMcpUrl('browser'), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, ...(session ? { [KORTIX_SESSION_HEADER]: session } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  return ((await res.json()) as { result: { structuredContent?: any; isError?: boolean; content: Array<{ text: string }> } }).result;
}

const data = () => stored!.data as any;

test('each session gets its own copy; connecting again reuses it and wakes it', async () => {
  const a = await call('connect');
  expect(a.structuredContent).toMatchObject({ copy: 'br_1', new: true, cdp_url: 'wss://browsers.example.test/br_1?token=t' });
  expect(creates[0]).toMatchObject({ idleTimeoutMinutes: 30, idempotencyKey: expect.stringMatching(/^kortix-browser-[0-9a-f-]{36}$/) });
  expect(creates[0]!.profileId).toBeUndefined();

  const b = await call('connect', {}, SESSION_B);
  expect(b.structuredContent).toMatchObject({ copy: 'br_2', new: true });

  browsers.set('br_1', { ...browsers.get('br_1')!, status: 'paused' });
  const again = await call('connect', { ttl_seconds: 99_999 });
  expect(again.structuredContent).toMatchObject({ copy: 'br_1', new: false, status: 'running' });
  expect(calls).toContain('resume br_1');
  expect(calls).toContain('cdp br_1 3600');

  const listed = await call('copies', {}, SESSION_B);
  expect(listed.structuredContent.copies.map((c: { copy: string; yours: boolean }) => [c.copy, c.yours])).toEqual([['br_1', false], ['br_2', true]]);
  expect(JSON.stringify(listed)).not.toContain('wss://');
});

test(`at most ${COPIES_MAX} copies run at once`, async () => {
  for (let n = 0; n < COPIES_MAX; n++) await call('connect', {}, `9a0b1c2d-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`);
  const over = await call('connect', {}, SESSION_B);
  expect(over.isError).toBe(true);
  expect(over.content[0]!.text).toContain('release one');
});

test('save_login merges one site into the identity; the next copy starts signed in there', async () => {
  await call('connect');
  await call('connect', {}, SESSION_B);
  // Session A signs in to github, session B to example.
  live.set('br_1', { cookies: [cookie('gh_session', '.github.com', 'A')], origins: [{ origin: 'https://github.com', localStorage: [{ name: 'k', value: 'A' }] }] });
  live.set('br_2', { cookies: [cookie('ex_session', 'app.example.test', 'B'), cookie('gh_session', '.github.com', 'stale')], origins: [] });

  expect((await call('save_login', { site: 'https://github.com' })).structuredContent).toMatchObject({ saved: 'https://github.com', cookies: 1 });
  expect((await call('save_login', { site: 'app.example.test' }, SESSION_B)).structuredContent).toMatchObject({ saved: 'https://app.example.test', cookies: 1 });

  // B's stale github cookie did not overwrite A's login: each save took only its own site.
  const identity = profiles.get(data().profileId)!;
  expect(identity.cookies.map((c) => `${c.name}=${c.value}`).sort()).toEqual(['ex_session=B', 'gh_session=A']);
  expect(data().sites).toMatchObject({ 'https://github.com': { savedAt: expect.any(String) }, 'https://app.example.test': { savedAt: expect.any(String) } });

  const fresh = await call('connect', {}, '9a0b1c2d-0000-4000-8000-00000000000c');
  expect(creates.at(-1)).toMatchObject({ profileId: data().profileId });
  expect(fresh.structuredContent.saved_logins.sort()).toEqual(['https://app.example.test', 'https://github.com']);
  expect(live.get(fresh.structuredContent.copy)!.cookies).toHaveLength(2);
});

test('mergeSiteState keeps parent-domain cookies with their site and leaves other sites alone', () => {
  const identity: StorageState = { cookies: [cookie('a', '.google.com', 'old'), cookie('b', 'other.test')], origins: [{ origin: 'https://other.test', localStorage: [] }] };
  const copy: StorageState = { cookies: [cookie('a', '.google.com', 'new'), cookie('c', 'mail.google.com'), cookie('b', 'other.test', 'stale')], origins: [{ origin: 'https://mail.google.com', localStorage: [{ name: 'x', value: '1' }] }] };
  const merged = mergeSiteState(identity, copy, 'https://mail.google.com');
  expect(merged.cookies.map((c) => `${c.name}@${c.domain}=${c.value}`).sort()).toEqual(['a@.google.com=new', 'b@other.test=v', 'c@mail.google.com=v']);
  expect(merged.origins.map((o) => o.origin).sort()).toEqual(['https://mail.google.com', 'https://other.test']);

  const all = mergeSiteState(identity, copy, null);
  expect(all.cookies.map((c) => `${c.name}=${c.value}`).sort()).toEqual(['a=new', 'b=stale', 'c=v']);
});

test('a stored password is never returned; forget deletes it', async () => {
  const remembered = await call('remember_login', { site: 'https://Accounts.Example.test/signin', username: 'otto@example.test', generate_password: true, notes: 'free plan' });
  expect(remembered.structuredContent).toMatchObject({ site: 'https://accounts.example.test', has_password: true, password_generated: true });
  const password = data().sites['https://accounts.example.test'].password as string;
  expect(password).toHaveLength(20);
  const listed = await call('logins');
  expect(listed.structuredContent.logins).toEqual([expect.objectContaining({ site: 'https://accounts.example.test', username: 'otto@example.test', has_password: true })]);
  for (const out of [remembered, listed]) expect(JSON.stringify(out)).not.toContain(password);

  expect((await call('remember_login', { site: 'accounts.example.test', forget: true })).structuredContent).toEqual({ forgot: 'https://accounts.example.test' });
  expect(data().sites).toEqual({});
});

test('two sessions writing at once both land', async () => {
  const token = encodeAccountState({ ...ACCOUNT, data: {} });
  const send = (site: string, session: string) =>
    dispatchKortixAgentMcp(new Request(kortixAgentMcpUrl('browser'), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, [KORTIX_SESSION_HEADER]: session },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'remember_login', arguments: { site, username: 'u' } } }),
    }));
  await Promise.all([send('one.example.test', SESSION_A), send('two.example.test', SESSION_B)]);
  expect(Object.keys(data().sites).sort()).toEqual(['https://one.example.test', 'https://two.example.test']);
});

test('release closes a copy; a copy Platinum lost is dropped; reset deletes everything', async () => {
  await call('connect');
  await call('connect', {}, SESSION_B);
  expect((await call('release')).structuredContent).toEqual({ released: 'br_1' });
  // The next copy is a new browser, with its own create key.
  expect(new Set(creates.map((c) => c.idempotencyKey)).size).toBe(creates.length);
  expect(calls).toContain('remove br_1');
  expect(Object.keys(data().copies)).toEqual([SESSION_B]);

  browsers.set('br_2', { id: 'br_2', status: 'failed' });
  expect((await call('copies')).structuredContent.copies).toEqual([]);
  expect(data().copies).toEqual({});

  await call('connect');
  live.set('br_3', { cookies: [cookie('s', 'example.test')], origins: [] });
  await call('save_login', { site: 'example.test' });
  expect((await call('reset', {})).isError).toBe(true);
  expect((await call('reset', { confirm: 'reset' })).structuredContent).toEqual({ reset: true, closed: 1 });
  expect(calls.filter((c) => c.startsWith('delete profile'))).toHaveLength(2);
  expect(data()).toEqual({});
});

test('save_login and fill_login need this session\'s copy', async () => {
  for (const name of ['save_login', 'fill_login']) {
    const r = await call(name, { site: 'example.test' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('connect first');
  }
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
