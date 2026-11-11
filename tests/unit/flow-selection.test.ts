/**
 * Flow selection is exact (src/core/selection.ts): every named id, domain and
 * tag must select something, and an empty filter is a usage error.
 */
import { describe, expect, it } from 'vitest';
import { buildLocalTestPlan, runLocalTests } from '../src/core/local-runner';
import { SelectionError, assertFlowFilterArgs, parseGrepFlag, parseListFlag, selectFlows } from '../src/core/selection';

const flows = [
  { id: 'ACC-4', meta: { domain: 'access', tags: ['smoke'] } },
  { id: 'ACC-5', meta: { domain: 'access' } },
  { id: 'BILL-1', meta: { domain: 'billing', tags: ['deployed'] } },
];

const ids = (list: Array<{ id: string }>) => list.map((f) => f.id);

describe('selectFlows', () => {
  it('selects exactly the named ids', () => {
    expect(ids(selectFlows(flows, { ids: ['ACC-4', 'BILL-1'] }))).toEqual(['ACC-4', 'BILL-1']);
  });

  it('fails naming an unknown id instead of running the known one alone', () => {
    expect(() => selectFlows(flows, { ids: ['ACC-4', 'BOGUS'] })).toThrow(/unknown flow id: BOGUS/);
  });

  it('fails on an unknown domain and an unknown tag', () => {
    expect(() => selectFlows(flows, { domains: ['acess'] })).toThrow(/unknown domain: acess/);
    expect(() => selectFlows(flows, { tags: ['nope'] })).toThrow(/unknown tag: nope/);
  });

  it('fails when another filter drops a named id', () => {
    expect(() => selectFlows(flows, { ids: ['BILL-1'], domains: ['access'] })).toThrow(
      /flow id excluded by the other filters: BILL-1/,
    );
  });

  it('fails when a grep matches nothing', () => {
    expect(() => selectFlows(flows, { grep: 'ZZZ' })).toThrow(SelectionError);
    expect(ids(selectFlows(flows, { grep: 'ACC' }))).toEqual(['ACC-4', 'ACC-5']);
  });

  it('selects every flow with no filter', () => {
    expect(ids(selectFlows(flows, {}))).toEqual(['ACC-4', 'ACC-5', 'BILL-1']);
  });
});

describe('filter values', () => {
  it('rejects --id with no value, --id= and --id=,', () => {
    expect(() => parseListFlag('id', true)).toThrow(/--id requires a value/);
    expect(() => parseListFlag('id', '')).toThrow(/--id requires a non-empty value/);
    expect(() => parseListFlag('domain', ' , ')).toThrow(/--domain requires a non-empty value/);
    expect(() => parseGrepFlag('')).toThrow(/--grep requires a non-empty value/);
    expect(parseListFlag('id', undefined)).toBeUndefined();
    expect(parseListFlag('id', 'A, B')).toEqual(['A', 'B']);
  });

  it('checks pnpm test arguments in both --x=v and --x v forms', () => {
    expect(() => assertFlowFilterArgs(['--id='])).toThrow(SelectionError);
    expect(() => assertFlowFilterArgs(['--domain'])).toThrow(SelectionError);
    expect(() => assertFlowFilterArgs(['--id', '--domain', 'access'])).toThrow(/--id requires a value/);
    expect(() => assertFlowFilterArgs(['--grep='])).toThrow(SelectionError);
    expect(() => assertFlowFilterArgs(['--id', 'ACC-4', '--domain=access', '--grep', 'ACC'])).not.toThrow();
  });

  it('treats --grep as a flow filter, so it selects the flows lane', () => {
    expect(buildLocalTestPlan(['--grep', 'ACC']).mode).toBe('flows');
  });

  it('pnpm test exits 2 on an empty filter before any lane starts', async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.join(' '));
    try {
      expect(await runLocalTests('/nonexistent', ['--id='])).toBe(2);
    } finally {
      console.error = original;
    }
    expect(errors.join('\n')).toMatch(/USAGE: --id requires a non-empty value/);
  });
});
