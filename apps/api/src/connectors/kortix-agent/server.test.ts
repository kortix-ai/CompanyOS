import { afterAll, expect, test } from 'bun:test';
import { kortixAgentMcpUrl } from './host';
import { dispatchKortixAgentMcp, setKortixAgentClockForTests } from './server';
import { type AccountState, decodeAccountState, encodeAccountState, setAccountStatePersistForTests } from './state';
import { totp } from './totp';

const PROJECT = '4f2a9c1e-1111-4222-8333-944445555666';
let stored: AccountState | null = null;
setAccountStatePersistForTests(async (state) => {
  stored = state;
});
const NOW = 1_795_800_000_000;
setKortixAgentClockForTests(() => NOW);
afterAll(() => {
  setAccountStatePersistForTests(null);
  setKortixAgentClockForTests(null);
});

function account(service: 'authenticator' | 'browser' = 'authenticator', data: Record<string, unknown> = {}): string {
  return encodeAccountState({
    projectId: PROJECT,
    connectorId: '0f0e0d0c-0000-4000-8000-000000000001',
    connectionId: '0f0e0d0c-0000-4000-8000-000000000002',
    service,
    data,
  });
}

let nextId = 1;
async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}, service: 'authenticator' | 'browser' = 'authenticator') {
  const res = await dispatchKortixAgentMcp(new Request(kortixAgentMcpUrl(service), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  }));
  return { status: res.status, body: (await res.json()) as any };
}

const call = async (token: string, name: string, args: Record<string, unknown> = {}) => {
  const r = await rpc(token, 'tools/call', { name, arguments: args });
  return r.body.result as { structuredContent?: any; isError?: boolean; content: Array<{ text: string }> };
};

test('initialize and tools/list name the authenticator tools', async () => {
  const init = await rpc(account(), 'initialize', { protocolVersion: '2025-06-18' });
  expect(init.body.result.serverInfo.name).toBe('kortix-agent-authenticator');
  expect(init.body.result.protocolVersion).toBe('2025-06-18');
  const list = await rpc(account(), 'tools/list');
  expect(list.body.result.tools.map((t: { name: string }) => t.name)).toEqual(['add_account', 'list_accounts', 'get_code', 'remove_account']);
});

test('add a key, get its code, list without secrets, remove it', async () => {
  const added = await call(account(), 'add_account', { uri: 'otpauth://totp/Example:otto%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=Example' });
  expect(added.isError).toBeUndefined();
  const key = { secret: 'JBSWY3DPEHPK3PXP', issuer: 'Example', account: 'otto@example.test', algorithm: 'SHA1' as const, digits: 6, period: 30 };
  expect(added.structuredContent).toMatchObject({ label: 'Example (otto@example.test)', issuer: 'Example', code: totp(key, NOW).code });
  expect(JSON.stringify(added)).not.toContain('JBSWY3DPEHPK3PXP');

  // The new state was written to the credential, and the next call reads it.
  expect(stored).not.toBeNull();
  const token = encodeAccountState(stored!);
  expect(decodeAccountState(token, 'authenticator').data).toMatchObject({ entries: [{ label: 'Example (otto@example.test)' }] });

  const code = await call(token, 'get_code', { issuer: 'example' });
  expect(code.structuredContent).toEqual({ id: added.structuredContent.id, label: 'Example (otto@example.test)', code: totp(key, NOW).code, expires_in_seconds: totp(key, NOW).expiresInSeconds });

  const listed = await call(token, 'list_accounts');
  expect(listed.structuredContent.accounts).toHaveLength(1);
  expect(JSON.stringify(listed)).not.toContain('JBSWY3DPEHPK3PXP');

  const removed = await call(token, 'remove_account', { id: added.structuredContent.id });
  expect(removed.structuredContent.removed.id).toBe(added.structuredContent.id);
  expect((stored!.data as { entries: unknown[] }).entries).toEqual([]);
});

test('a bare secret works; a bad one and an unknown key are tool errors', async () => {
  const added = await call(account(), 'add_account', { secret: 'jbsw y3dp ehpk 3pxp', issuer: 'Site', account: 'otto' });
  expect(added.structuredContent.label).toBe('Site (otto)');
  expect((await call(account(), 'add_account', { secret: 'nope!' })).isError).toBe(true);
  const missing = await call(account(), 'get_code', { issuer: 'nothing' });
  expect(missing.isError).toBe(true);
  expect(missing.content[0]!.text).toContain('no key matches');
});

test('no credential, a broken one, or another service’s is a 401', async () => {
  expect((await rpc(null, 'tools/list')).status).toBe(401);
  expect((await rpc('ka1.not-a-uuid.x', 'tools/list')).status).toBe(401);
  const browserToken = account('browser');
  const crossed = await rpc(browserToken, 'tools/list');
  expect(crossed.status).toBe(401);
  expect(crossed.body.error_description).toContain('browser');
});
