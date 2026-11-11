import { describe, expect, test } from 'bun:test';
import { createToolCore, SEARCH_PAGE_BYTES } from './core';
import { tokenize } from './rank';
import type { ToolEntry, ToolSource } from './types';

function source(prefix: string, entries: ToolEntry[], calls: unknown[] = []): ToolSource {
  return {
    prefix,
    list: async () => entries,
    call: async (id, input) => {
      calls.push({ id, input });
      return { status: 'ok', data: { id } };
    },
  };
}

const slack: ToolEntry[] = [
  {
    id: 'connectors.slack.send_message',
    title: 'Send a message',
    description: 'Post a message to a Slack channel.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { channel: { type: 'string' }, text: { type: 'string' }, thread_ts: { type: 'string' } },
      required: ['channel', 'text'],
    },
  },
  { id: 'connectors.slack.list_channels', title: 'List channels', description: 'Every channel the bot sees.', risk: 'read' },
];
const kortix: ToolEntry[] = [
  { id: 'kortix.GET /v1/projects', title: 'List projects', description: 'Projects the caller can open.', risk: 'read' },
  {
    id: 'kortix.POST /v1/projects/{projectId}/sessions',
    title: 'Start a session',
    description: 'Start an agent session in a project.',
    risk: 'write',
  },
];

describe('tokenize', () => {
  test('splits ids, paths and camelCase into stems', () => {
    expect(tokenize('connectors.slack.send_message')).toEqual(['connector', 'slack', 'send', 'message']);
    expect(tokenize('POST /v1/projects/{projectId}/sessions')).toEqual(['post', 'project', 'project', 'id', 'session']);
  });
});

describe('search', () => {
  test('ranks a name match first across families', async () => {
    const core = createToolCore({ sources: [source('connectors.', slack), source('kortix.', kortix)] });
    const page = await core.search({ query: 'send slack message' });
    expect(page.results[0]!.id).toBe('connectors.slack.send_message');
    expect(page.results[0]!.input).toBe('channel: string, text: string, thread_ts?: string');
  });

  test('family narrows to one id prefix', async () => {
    const core = createToolCore({ sources: [source('connectors.', slack), source('kortix.', kortix)] });
    const page = await core.search({ query: 'list', family: 'kortix' });
    expect(page.results.map((r) => r.id)).toEqual(['kortix.GET /v1/projects']);
  });

  test('a page never exceeds the byte budget, and says it was cut', async () => {
    const many: ToolEntry[] = Array.from({ length: 50 }, (_, i) => ({
      id: `connectors.big.action_${i}`,
      title: `Big action ${i}`,
      description: 'x'.repeat(400),
      risk: 'read',
    }));
    const core = createToolCore({ sources: [source('connectors.', many)] });
    const page = await core.search({ query: 'big action', limit: 50 });
    expect(JSON.stringify(page.results).length).toBeLessThanOrEqual(SEARCH_PAGE_BYTES);
    expect(page.truncated).toBe(true);
    expect(page.results.length).toBeGreaterThan(0);
  });

  test('7,000 actions: index plus one search stays under 1.5 s, a warm search under 50 ms', async () => {
    const many: ToolEntry[] = Array.from({ length: 7000 }, (_, i) => ({
      id: `connectors.app${i % 140}.op_${i}`,
      title: `Operation ${i} on app ${i % 140}`,
      description: `Reads or writes resource kind ${i % 97} for app ${i % 140}.`,
      risk: i % 3 === 0 ? 'write' : 'read',
    }));
    const core = createToolCore({ sources: [source('connectors.', many)] });
    const t0 = performance.now();
    await core.search({ query: 'app42 resource' });
    expect(performance.now() - t0).toBeLessThan(1500);
    const t1 = performance.now();
    const page = await core.search({ query: 'operation 4242' });
    expect(performance.now() - t1).toBeLessThan(50);
    expect(page.results[0]!.id).toBe('connectors.app42.op_4242');
  });
});

describe('describe and call', () => {
  test('describe returns the full schema; an unknown id returns suggestions', async () => {
    const core = createToolCore({ sources: [source('connectors.', slack)] });
    const found = await core.describe('connectors.slack.send_message');
    expect(found).toMatchObject({ id: 'connectors.slack.send_message', input_schema: { required: ['channel', 'text'] } });
    const missing = await core.describe('connectors.slack.send_mesage');
    expect(missing).toMatchObject({ suggestions: expect.arrayContaining(['connectors.slack.send_message']) });
  });

  test('call routes by the longest prefix and passes input through', async () => {
    const calls: unknown[] = [];
    const core = createToolCore({
      sources: [source('connectors.', slack, calls), source('connectors.slack.', slack, calls)],
    });
    expect(await core.call('connectors.slack.send_message', { channel: 'C1', text: 'hi' })).toEqual({
      status: 'ok',
      data: { id: 'connectors.slack.send_message' },
    });
    expect(calls).toEqual([{ id: 'connectors.slack.send_message', input: { channel: 'C1', text: 'hi' } }]);
  });

  test('call of an id no source owns is an error naming the closest ids', async () => {
    const core = createToolCore({ sources: [source('connectors.', slack)] });
    const out = await core.call('slack.send_message', {});
    expect(out).toMatchObject({ status: 'error', reason: 'unknown_tool' });
    expect(out.status === 'error' && out.message).toContain('connectors.slack.send_message');
  });

  test('a failing source lists nothing instead of failing every search', async () => {
    const broken: ToolSource = { prefix: 'kortix.', list: async () => { throw new Error('down'); }, call: async () => ({ status: 'ok', data: null }) };
    const core = createToolCore({ sources: [source('connectors.', slack), broken] });
    expect((await core.search({ query: 'slack' })).results.length).toBeGreaterThan(0);
  });
});

describe('call of an unknown id inside a known family', () => {
  test('is refused with suggestions before the source runs', async () => {
    const calls: unknown[] = [];
    const core = createToolCore({ sources: [source('connectors.', slack, calls)] });
    const out = await core.call('connectors.slack.send_mesage', {});
    expect(out).toMatchObject({ status: 'error', reason: 'unknown_tool' });
    expect(out.status === 'error' && out.message).toContain('connectors.slack.send_message');
    expect(calls).toHaveLength(0);
  });
});

test('a typo of a built-in id suggests the built-in first', async () => {
  const builtins: ToolEntry[] = [{ id: 'projects.list', title: 'List projects', description: 'Every project.', risk: 'read' }];
  const core = createToolCore({ sources: [source('projects.', builtins), source('kortix.', kortix)] });
  expect((await core.suggest('projects.lst'))[0]).toBe('projects.list');
});
