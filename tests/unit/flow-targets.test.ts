/**
 * Per-target applicability (`FlowMeta.targets`, src/core/targets.ts) and the
 * proof rules for a run (src/core/result.ts).
 */
import { describe, expect, it } from 'vitest';
import type { RegisteredFlow } from '../src/core/flow';
import { planLocalFlows } from '../src/core/local-profile';
import { reconcileExecuted, unprovenPassReason, type FlowResult } from '../src/core/result';
import {
  isSkipSentence,
  normalizeFlowTargets,
  runTargetKind,
  targetCounts,
  targetSkipReason,
} from '../src/core/targets';
import type { FlowMeta } from '../src/core/types';

const meta = (extra: Partial<FlowMeta> = {}): FlowMeta => ({ domain: 'test', ...extra });

describe('normalizeFlowTargets', () => {
  it('folds the deployed tag into targets.deployed and back', () => {
    const tagged = meta({ tags: ['deployed'] });
    normalizeFlowTargets('A-1', tagged);
    expect(tagged.targets).toEqual({ deployed: true });

    const declared = meta({ targets: { deployed: true } });
    normalizeFlowTargets('A-2', declared);
    expect(declared.tags).toEqual(['deployed']);
  });

  it('refuses a skip without a sentence, an unknown target, and a tag that contradicts a skip', () => {
    for (const skip of ['', 'n/a', 'skip it', '  no period here at all  ']) {
      expect(() => normalizeFlowTargets('B-1', meta({ targets: { local: { skip } } }))).toThrow(/one sentence/);
    }
    expect(() => normalizeFlowTargets('B-2', meta({ targets: { cloud: true } as never }))).toThrow(/unknown target "cloud"/);
    expect(() =>
      normalizeFlowTargets('B-3', meta({ tags: ['deployed'], targets: { deployed: { skip: 'Staging has no fake issuer here.' } } })),
    ).toThrow(/tagged "deployed" but targets.deployed is a skip/);
  });

  it('accepts a sentence reason', () => {
    expect(isSkipSentence('The local profile has no Stripe account.')).toBe(true);
    const m = meta({ targets: { local: { skip: 'The local profile has no Stripe account.' } } });
    expect(() => normalizeFlowTargets('C-1', m)).not.toThrow();
    expect(targetSkipReason(m, 'local')).toBe('The local profile has no Stripe account.');
    expect(targetSkipReason(m, 'deployed')).toBeNull();
  });
});

describe('target kinds', () => {
  it('maps a run to local, selfhost (preview) or deployed', () => {
    expect(runTargetKind('local', {})).toBe('local');
    expect(runTargetKind('all', { KE2E_TARGET: 'preview' })).toBe('selfhost');
    expect(runTargetKind('all', { KE2E_TARGET: 'staging' })).toBe('deployed');
    expect(runTargetKind(undefined, {})).toBe('deployed');
  });

  it('counts declared and skipped-with-reason flows per target', () => {
    const counts = targetCounts([
      { id: 'A', meta: { targets: { deployed: true } } },
      { id: 'B', meta: { targets: { local: { skip: 'Needs a real cloud sandbox.' } } } },
      { id: 'C', meta: {} },
    ]);
    expect(counts.deployed).toEqual({ declared: 1, skipped: [] });
    expect(counts.local).toEqual({ declared: 0, skipped: [{ id: 'B', reason: 'Needs a real cloud sandbox.' }] });
    expect(counts.selfhost.skipped).toEqual([]);
  });

  it('planLocalFlows excludes a declared local skip with its reason', () => {
    const flow = (id: string, m: FlowMeta): RegisteredFlow => ({ id, meta: m, fn: async () => {} });
    const plan = planLocalFlows([
      flow('L-1', meta({ targets: { local: { skip: 'Needs a real cloud sandbox.' } } })),
      flow('L-2', meta()),
    ]);
    expect(plan.runnable.map((f) => f.id)).toEqual(['L-2']);
    expect(plan.excluded).toEqual([{ id: 'L-1', reason: 'targets.local: Needs a real cloud sandbox.' }]);
  });
});

describe('a pass must prove something', () => {
  const step = (assertions: number) => ({ assertions: Array.from({ length: assertions }, () => ({}) as never) });

  it('fails a pass with zero steps or zero recorded assertions', () => {
    expect(unprovenPassReason([])).toMatch(/zero steps/);
    expect(unprovenPassReason([step(0), step(0)])).toMatch(/2 step\(s\) with zero recorded assertions/);
    expect(unprovenPassReason([step(0), step(1)])).toBeNull();
  });

  it('turns a scheduled flow with no result, and a duplicated result, into failures', () => {
    const result = (id: string): FlowResult => ({
      id, domain: 'd', tags: [], status: 'pass', durationMs: 1, attempts: 1, steps: [],
    });
    const out = reconcileExecuted(
      [{ id: 'A', domain: 'd' }, { id: 'B', domain: 'd' }],
      [result('A'), result('C'), result('C')],
    );
    const byId = (id: string) => out.filter((r) => r.id === id);
    expect(byId('A')[0]!.status).toBe('pass');
    expect(byId('B')[0]).toMatchObject({ status: 'fail', reason: expect.stringMatching(/scheduled but never executed/) });
    expect(byId('C').every((r) => r.status === 'fail' && /never scheduled/.test(r.reason ?? ''))).toBe(true);
  });
});
