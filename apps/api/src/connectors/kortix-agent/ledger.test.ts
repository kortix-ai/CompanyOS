import { afterAll, beforeEach, expect, test } from 'bun:test';
import { kortixAgentMcpUrl } from './host';
import { type LedgerApi, type LedgerEvent, setLedgerForTests } from './ledger';
import { dispatchKortixAgentMcp, setKortixAgentClockForTests } from './server';
import { encodeAccountState } from './state';

const PROJECT = '4f2a9c1e-1111-4222-8333-944445555666';
const TOKEN = encodeAccountState({ projectId: PROJECT, connectorId: '0f0e0d0c-0000-4000-8000-000000000001', connectionId: '0f0e0d0c-0000-4000-8000-000000000007', service: 'events', data: {} });

const email = (id: number, at: string, summary: string): LedgerEvent => ({
  eventId: id, source: 'email', type: 'email.message.received', subject: `email:in_1:th_${id}`, occurredAt: new Date(at),
  actor: { kind: 'external', id: 'noreply@example.test', name: 'noreply@example.test' }, summary,
  payload: { event: { data: { inbox_id: 'in_1', thread_id: `th_${id}`, email_id: `em_${id}` } } },
});

let events: LedgerEvent[];
let now: number;
const fake: LedgerApi = {
  async list({ source, text, since, limit }) {
    return events
      .filter((e) => (!source || e.source === source) && (!text || e.summary.toLowerCase().includes(text.toLowerCase())) && (!since || e.occurredAt >= since))
      .sort((a, b) => b.eventId - a.eventId)
      .slice(0, limit);
  },
  async get({ eventId }) {
    return events.find((e) => e.eventId === eventId) ?? null;
  },
  async emailBody({ emailId }) {
    return { from: 'noreply@example.test', subject: 'Verify your account', text: `Your code is ${emailId === 'em_2' ? '482913' : '111111'}. It expires in 10 minutes.` };
  },
};

beforeEach(() => {
  events = [email(1, '2026-11-27T15:00:00Z', 'Email from noreply@example.test: Welcome')];
  now = Date.parse('2026-11-27T16:00:00Z');
  setKortixAgentClockForTests(() => now);
  setLedgerForTests(fake, async (ms) => {
    now += ms;
    if (events.length === 1) events.push(email(2, new Date(now).toISOString(), 'Email from noreply@example.test: Verify your account'));
  });
});
afterAll(() => {
  setLedgerForTests(null);
  setKortixAgentClockForTests(null);
});

async function call(name: string, args: Record<string, unknown>) {
  const res = await dispatchKortixAgentMcp(new Request(kortixAgentMcpUrl('events'), {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  return ((await res.json()) as { result: { structuredContent?: any; isError?: boolean; content: Array<{ text: string }> } }).result;
}

test('search lists events newest first, filtered by source and text', async () => {
  events.push(email(3, '2026-11-27T15:30:00Z', 'Email from billing@example.test: Invoice'));
  const r = await call('search', { source: 'email', text: 'invoice' });
  expect(r.structuredContent.events).toEqual([{ id: 3, source: 'email', type: 'email.message.received', about: 'email:in_1:th_3', from: 'noreply@example.test', summary: 'Email from billing@example.test: Invoice', at: '2026-11-27T15:30:00.000Z' }]);
});

test('wait_for returns the next matching email with its code, read from the inbox', async () => {
  const r = await call('wait_for', { source: 'email', text: 'verify', since: '2026-11-27T16:00:00Z' });
  expect(r.structuredContent).toMatchObject({ received: true, code: '482913', event: { id: 2, codes: ['482913'] } });
  expect(r.structuredContent.event.text).toContain('Your code is 482913');
});

test('wait_for gives up at the timeout; get reads one event', async () => {
  setLedgerForTests(fake, async (ms) => {
    now += ms;
  });
  expect((await call('wait_for', { text: 'nothing', timeout_seconds: 6 })).structuredContent).toEqual({ received: false, waited_until: '2026-11-27T16:00:06.000Z' });
  expect((await call('get', { id: 1 })).structuredContent).toMatchObject({ id: 1, codes: ['111111'] });
  expect((await call('get', { id: 99 })).isError).toBe(true);
});
