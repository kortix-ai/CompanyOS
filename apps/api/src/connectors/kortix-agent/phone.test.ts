import { afterAll, beforeEach, expect, test } from 'bun:test';
import { kortixAgentMcpUrl } from './host';
import { codesIn, type PhoneApi, type PhoneMessage, setPhoneApiForTests, setPhoneSleepForTests } from './phone';
import { dispatchKortixAgentMcp, setKortixAgentClockForTests } from './server';
import { type AccountState, encodeAccountState, setAccountStatePersistForTests } from './state';

const ACCOUNT = { projectId: '4f2a9c1e-1111-4222-8333-944445555666', connectorId: '0f0e0d0c-0000-4000-8000-000000000001', connectionId: '0f0e0d0c-0000-4000-8000-000000000004', service: 'phone' as const };
const NUMBER = '+15005550006';

let stored: AccountState | null;
let owned: Map<string, { id: string; number: string }>;
let inbox: PhoneMessage[];
let sent: Array<{ from: string; to: string; body: string }>;
let buys: number;
let released: string[];
let now: number;

const fake: PhoneApi = {
  async findNumber(tag) {
    return owned.get(tag) ?? null;
  },
  async buyNumber({ tag }) {
    buys++;
    const n = { id: `PN${buys}`, number: NUMBER };
    owned.set(tag, n);
    return n;
  },
  async releaseNumber(id) {
    released.push(id);
  },
  async send(input) {
    sent.push(input);
    return { id: 'SM1', status: 'queued' };
  },
  async listInbound({ to, since }) {
    return inbox.filter((m) => m.to === to && (!since || new Date(m.sentAt) >= since)).slice().reverse();
  },
};

beforeEach(() => {
  stored = null;
  owned = new Map();
  inbox = [];
  sent = [];
  buys = 0;
  released = [];
  now = Date.parse('2026-11-27T16:00:00Z');
  setPhoneApiForTests(fake);
  setKortixAgentClockForTests(() => now);
  // Each wait advances the fake clock by the wait.
  setPhoneSleepForTests(async (ms) => {
    now += ms;
  });
  setAccountStatePersistForTests(async (state) => {
    stored = state;
  });
});
afterAll(() => {
  setPhoneApiForTests(null);
  setPhoneSleepForTests(null);
  setKortixAgentClockForTests(null);
  setAccountStatePersistForTests(null);
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const token = encodeAccountState(stored ?? { ...ACCOUNT, data: {} });
  const res = await dispatchKortixAgentMcp(new Request(kortixAgentMcpUrl('phone'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  return ((await res.json()) as { result: { structuredContent?: any; isError?: boolean; content: Array<{ text: string }> } }).result;
}

const text = (body: string, at: string, from = '+12025550100'): PhoneMessage => ({ id: `SM${inbox.length + 10}`, from, to: NUMBER, body, direction: 'inbound', sentAt: at });

test('codesIn finds 4 to 8 digit codes and split codes, not longer numbers', () => {
  expect(codesIn('Your GitHub code is 482913.')).toEqual(['482913']);
  expect(codesIn('Code: 123-456. Do not share.')).toEqual(['123456']);
  expect(codesIn('Use 4821 or call +14155550123')).toEqual(['4821']);
  expect(codesIn('no digits here')).toEqual([]);
});

test('get_number buys once and returns the same number after', async () => {
  const first = await call('get_number', { country: 'us', area_code: '415' });
  expect(first.structuredContent).toEqual({ number: NUMBER, country: 'US', new: true });
  expect(stored!.data).toMatchObject({ number: NUMBER, numberId: 'PN1', country: 'US' });
  const again = await call('get_number');
  expect(again.structuredContent).toEqual({ number: NUMBER, country: 'US', new: false });
  expect(buys).toBe(1);
});

test('a number bought before its state write failed is found by tag, not bought twice', async () => {
  owned.set(`kortix-${ACCOUNT.connectionId}`, { id: 'PN9', number: NUMBER });
  const r = await call('get_number');
  expect(r.structuredContent).toMatchObject({ number: NUMBER, new: false });
  expect(buys).toBe(0);
  expect(stored!.data).toMatchObject({ numberId: 'PN9' });
});

test('wait_for_code returns the first matching text after since', async () => {
  await call('get_number');
  inbox.push(text('Old code 111111', '2026-11-27T15:00:00Z'));
  setPhoneSleepForTests(async (ms) => {
    now += ms;
    if (inbox.length === 1) inbox.push(text('Your Example verification code is 739204', new Date(now).toISOString(), 'Example'));
  });
  const r = await call('wait_for_code', { since: '2026-11-27T16:00:00Z', from: 'example' });
  expect(r.structuredContent).toMatchObject({ received: true, code: '739204', message: { from: 'Example', codes: ['739204'] } });
});

test('wait_for_code gives up at the timeout', async () => {
  await call('get_number');
  const r = await call('wait_for_code', { timeout_seconds: 9 });
  expect(r.structuredContent).toEqual({ received: false, waited_until: '2026-11-27T16:00:09.000Z' });
});

test('list_messages, send_sms and release_number', async () => {
  expect((await call('list_messages')).isError).toBe(true);
  await call('get_number');
  inbox.push(text('Code 4821', '2026-11-27T15:59:00Z'));
  const listed = await call('list_messages');
  expect(listed.structuredContent.messages).toEqual([{ id: 'SM10', from: '+12025550100', body: 'Code 4821', codes: ['4821'], sent_at: '2026-11-27T15:59:00Z' }]);

  expect((await call('send_sms', { to: '415 555', body: 'hi' })).isError).toBe(true);
  const ok = await call('send_sms', { to: '+1 (202) 555-0100', body: 'hello' });
  expect(ok.structuredContent).toMatchObject({ sent: true, to: '+12025550100', from: NUMBER });
  expect(sent).toEqual([{ from: NUMBER, to: '+12025550100', body: 'hello' }]);

  expect((await call('release_number', { confirm: '+19999999999' })).isError).toBe(true);
  expect((await call('release_number', { confirm: NUMBER })).structuredContent).toEqual({ released: NUMBER });
  expect(released).toEqual(['PN1']);
  expect(stored!.data).toEqual({});
});
