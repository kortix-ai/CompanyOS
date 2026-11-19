import { expect, test } from 'bun:test';
import { selectTriggerCapacityModel } from './trigger-capacity';
const now = Date.parse('2026-11-19T16:00:00Z');
const usage = (limited: boolean, observed = now) => ({ limited, observed_at: new Date(observed).toISOString(), source: 'usage_endpoint', windows: [{ id: 'weekly', window_minutes: 10080, used_percent: limited ? 100 : 20, resets_at: new Date(now + 3600000).toISOString() }] });
const chain = ['claude-agent/sonnet', 'codex/gpt-6.1-sol'];
const select = (snapshots: unknown[], model = 'claude-agent/opus', fallbacks: string[] | undefined = chain) => selectTriggerCapacityModel({ model, fallbacks, snapshots, now, available: ['codex/gpt-6.1-sol'] });
test('explicit exhaustion skips shared Claude models and records intended model', () => expect(select([usage(true)])).toEqual({ model: 'codex/gpt-6.1-sol', intendedModel: 'claude-agent/opus', reason: 'claude-exhausted' }));
test('healthy pool and reset return intended Claude, not last fallback', () => { expect(select([usage(true), usage(false)]).model).toBe('claude-agent/opus'); expect(select([usage(false)]).model).toBe('claude-agent/opus'); });
test('unknown, malformed, stale and expired exhaustion fail closed', () => { for (const snapshots of [[], [null], [{limited:true}], [usage(true, now-300001)], [{...usage(true), windows: []}], [{...usage(true), windows:[{...usage(true).windows[0], resets_at:new Date(now-1).toISOString()}]}]]) expect(() => select(snapshots)).toThrow(); });
test('no opt-in and nonClaude routes do not inspect capacity or change model', () => { expect(select([], 'codex/gpt-6.1-sol').model).toBe('codex/gpt-6.1-sol'); expect(select([], 'kortix/morph_abliterated/morph-dsv41flash-abliterated').model).toContain('morph'); expect(selectTriggerCapacityModel({model:'claude-agent/opus', now, snapshots:[], available:[]})).toEqual({model:'claude-agent/opus'}); });
test('disabled fallback cannot be selected', () => expect(() => selectTriggerCapacityModel({model:'claude-agent/opus', fallbacks:chain, now, snapshots:[usage(true)], available:[]})).toThrow());
test('Opus-only exhaustion selects healthy Sonnet before Sol', () => {
 const windows=[{id:'weekly',used_percent:20,resets_at:new Date(now+3600000).toISOString()},{id:'seven_day_opus',used_percent:100,resets_at:new Date(now+3600000).toISOString()},{id:'seven_day_sonnet',used_percent:10,resets_at:new Date(now+3600000).toISOString()}];
 expect(selectTriggerCapacityModel({model:'claude-agent/opus',fallbacks:chain,snapshots:[{...usage(true),windows}],now,available:['claude-agent/sonnet','codex/gpt-6.1-sol']})).toEqual({model:'claude-agent/sonnet',intendedModel:'claude-agent/opus',reason:'claude-exhausted'});
});

test('unavailable Sonnet is skipped; no enabled fallback holds',()=>{
 const snapshot={...usage(true),windows:[{id:'seven_day_opus',used_percent:100,resets_at:new Date(now+3600000).toISOString()}]};
 expect(select([snapshot]).model).toBe('codex/gpt-6.1-sol');
 expect(()=>selectTriggerCapacityModel({model:'claude-agent/opus',fallbacks:chain,snapshots:[snapshot],now,available:[]})).toThrow();
});
test('unknown limited-window scope holds rather than treating intended model as available',()=>expect(()=>select([{...usage(true),windows:[{id:'seven_day_unknown',used_percent:100,resets_at:new Date(now+3600000).toISOString()}]}])).toThrow());
