import { describe, expect, test } from 'bun:test';
import type { AgentSpec, LoadedAgents } from '../agents/types';
import { botPauseReason, botsFromAgents, pausedAgents } from './bots';

function spec(name: string, extra: Partial<AgentSpec> = {}): AgentSpec {
  return { name, path: `kortix.yaml#agents.${name}`, enabled: true, connectors: [], permissions: [], env: [], model: null, ...extra } as AgentSpec;
}

describe('botsFromAgents', () => {
  test('lists messageable agents in manifest order and leaves subagents out', () => {
    const loaded: LoadedAgents = {
      specs: [spec('marketing', { model: 'anthropic/claude-opus-5-5' }), spec('writer', { subagent: true }), spec('sales')],
      errors: [],
      defaultAgent: 'sales',
    };
    const bots = botsFromAgents(loaded, new Map([['sales', 'space-1']]));
    expect(bots.map((b) => b.name)).toEqual(['marketing', 'sales']);
    expect(bots[0]).toEqual({
      name: 'marketing',
      display_name: 'marketing',
      model: 'anthropic/claude-opus-5-5',
      status: 'active',
      is_default: false,
      builtin: false,
      chat_space_id: null,
    });
    expect(bots[1]).toMatchObject({ is_default: true, chat_space_id: 'space-1' });
  });

  test('a disabled agent is listed as off', () => {
    const bots = botsFromAgents({ specs: [spec('legacy', { enabled: false })], errors: [] }, new Map());
    expect(bots[0]?.status).toBe('off');
  });

  test('My Kortix comes first only when the project runs it', () => {
    const on = botsFromAgents({ specs: [spec('marketing')], errors: [], builtinAgents: { my_kortix: true } as LoadedAgents['builtinAgents'] }, new Map());
    expect(on.map((b) => [b.name, b.display_name, b.builtin])).toEqual([
      ['mykortix', 'My Kortix', true],
      ['marketing', 'marketing', false],
    ]);
    const off = botsFromAgents({ specs: [spec('marketing')], errors: [] }, new Map());
    expect(off.map((b) => b.name)).toEqual(['marketing']);
  });
});

describe('bot pause', () => {
  test('a paused agent lists as paused; a disabled one stays off', () => {
    const loaded: LoadedAgents = { specs: [spec('marketing'), spec('legacy', { enabled: false })], errors: [] };
    const bots = botsFromAgents(loaded, new Map(), new Set(['marketing', 'legacy']));
    expect(bots.map((b) => b.status)).toEqual(['paused', 'off']);
  });

  test('botPauseReason holds a paused agent only while kortix_bot is on', () => {
    const on = { experimental: { kortix_bot: true }, paused_agents: ['marketing'] };
    expect(botPauseReason(on, 'marketing')).toBe('bot marketing is paused');
    expect(botPauseReason(on, 'sales')).toBeNull();
    expect(botPauseReason(on, null)).toBeNull();
    expect(botPauseReason({ paused_agents: ['marketing'] }, 'marketing')).toBeNull();
  });

  test('pausedAgents ignores a malformed value', () => {
    expect([...pausedAgents({ paused_agents: ['a', 3, null, 'b'] })]).toEqual(['a', 'b']);
    expect(pausedAgents({ paused_agents: 'a' }).size).toBe(0);
    expect(pausedAgents(null).size).toBe(0);
  });
});
