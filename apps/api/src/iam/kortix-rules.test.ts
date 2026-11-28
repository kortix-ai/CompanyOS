import { describe, expect, test } from 'bun:test';
import type { AgentGrant } from '@kortix/db';
import type { Policy } from '../connectors/policy';
import type { Operation } from '../shared/operation-registry';
import { agentListAllows, decideKortixOperation } from './kortix-rules';

const op = (id: string, action: string, exposure: Operation['exposure'] = 'agent', method = 'POST'): Operation => ({
  id,
  action,
  exposure,
  method,
  summary: null,
  tags: [],
});
const grant = (permissions: AgentGrant['permissions']): AgentGrant => ({ agent: 'worker', permissions, connectors: 'all' });
const secretsSet = op('secrets.set', 'project.secret.write');

describe('decideKortixOperation', () => {
  test('an operation for people only is blocked for every agent, whatever the rules say', () => {
    const d = decideKortixOperation({
      operation: op('billing.checkout.create', 'billing.write', 'human'),
      grant: null,
      projectPolicies: [{ match: 'kortix.*', action: 'always_run' }],
    });
    expect(d).toEqual({ action: 'block', source: 'exposure' });
  });

  test('no list and no rule: allow (the IAM role decides in the handler)', () => {
    expect(decideKortixOperation({ operation: secretsSet, grant: null, projectPolicies: [] })).toEqual({
      action: 'always_run',
      source: 'default',
    });
    expect(decideKortixOperation({ operation: secretsSet, grant: grant('all'), projectPolicies: [] }).action).toBe('always_run');
  });

  test('an old kortix_permissions list allows its actions and blocks every other one', () => {
    const g = grant(['project.secret.write']);
    expect(decideKortixOperation({ operation: secretsSet, grant: g, projectPolicies: [] })).toEqual({
      action: 'always_run',
      source: 'agent_permissions',
    });
    expect(
      decideKortixOperation({ operation: op('sessions.create', 'project.session.start'), grant: g, projectPolicies: [] }),
    ).toEqual({ action: 'block', source: 'agent_permissions' });
  });

  test('a list never has to name the membership tiers or an operation without an IAM check', () => {
    const g = grant([]);
    for (const action of ['project.read', 'project.write', 'none']) {
      expect(decideKortixOperation({ operation: op('x.get', action), grant: g, projectPolicies: [] }).action).toBe('always_run');
    }
  });

  test('a project rule that names kortix decides before the list, first match wins', () => {
    const projectPolicies: Policy[] = [
      { match: 'kortix.secrets.*', action: 'require_approval', position: 0 },
      { match: 'kortix.*', action: 'block', position: 1 },
    ];
    const d = decideKortixOperation({ operation: secretsSet, grant: grant(['project.secret.write']), projectPolicies });
    expect(d.action).toBe('require_approval');
    expect(d.source).toBe('project');
    expect(d.rule?.match).toBe('kortix.secrets.*');
  });

  test('a project rule that does not name kortix is about the other connectors', () => {
    const projectPolicies: Policy[] = [
      { match: '*', action: 'block' },
      { match: '*.set', action: 'require_approval' },
    ];
    expect(decideKortixOperation({ operation: secretsSet, grant: null, projectPolicies }).action).toBe('always_run');
  });

  test('a condition on the arguments decides with the request arguments', () => {
    const projectPolicies: Policy[] = [
      { match: 'kortix.secrets.set', action: 'block', conditions: [{ arg: 'name', match: 'PROD_*' }] },
    ];
    const decide = (args: Record<string, unknown> | null, argsAvailable: boolean) =>
      decideKortixOperation({ operation: secretsSet, grant: null, projectPolicies, args, argsAvailable }).action;
    expect(decide({ name: 'PROD_DB' }, true)).toBe('block');
    expect(decide({ name: 'DEV_DB' }, true)).toBe('always_run');
    // Arguments unknown: a restrictive rule applies (it is never skipped unevaluated).
    expect(decide(null, false)).toBe('block');
  });

  test("the agent's policy set on kortix replaces its list; a missing set blocks", () => {
    const g = grant([]);
    const set: Policy[] = [{ match: 'secrets.*', action: 'always_run' }];
    expect(decideKortixOperation({ operation: secretsSet, grant: g, projectPolicies: [], setPolicies: set })).toEqual({
      action: 'always_run',
      source: 'policy_set',
      rule: set[0],
    });
    expect(decideKortixOperation({ operation: secretsSet, grant: g, projectPolicies: [], setPolicies: null }).action).toBe('block');
  });

  test("the connector's base rules decide when nothing above did", () => {
    const d = decideKortixOperation({
      operation: secretsSet,
      grant: null,
      projectPolicies: [],
      connectorPolicies: [{ match: 'secrets.set', action: 'require_approval' }],
    });
    expect(d.action).toBe('require_approval');
    expect(d.source).toBe('connector');
  });
});

describe('agentListAllows', () => {
  test('sessions.stop needs project.session.stop: a list with only session.start is refused', () => {
    const g = grant(['project.session.start']);
    expect(decideKortixOperation({ operation: op('sessions.stop', 'project.session.stop'), grant: g, projectPolicies: [] }).action).toBe('block');
    expect(agentListAllows(grant(['project.session.stop']), 'project.session.stop')).toBe(true);
    expect(agentListAllows(null, 'project.session.stop')).toBe(true);
  });
});

describe('an untrusted session', () => {
  const untrusted = (operation: Operation, projectPolicies: Policy[] = []) =>
    decideKortixOperation({ operation, grant: null, projectPolicies, trust: 'untrusted' });

  test('reads stay allowed', () => {
    expect(untrusted(op('sessions.list', 'project.session.read', 'agent', 'GET')).action).toBe('always_run');
  });

  test('every other write asks first, even when a workspace rule allows it', () => {
    const d = untrusted(op('sessions.create', 'project.session.start'), [{ match: 'kortix.*', action: 'always_run' }]);
    expect(d).toEqual({ action: 'require_approval', source: 'untrusted' });
  });

  test('secrets, credentials, members, IAM and billing are blocked, reads included', () => {
    for (const [id, action, method] of [
      ['secrets.list', 'project.secret.read', 'GET'],
      ['secrets.set', 'project.secret.write', 'POST'],
      ['members.update', 'member.update', 'PATCH'],
      ['iam.assignments.create', 'iam.assignment.write', 'POST'],
    ] as const) {
      expect(untrusted(op(id, action, 'agent', method))).toEqual({ action: 'block', source: 'untrusted' });
    }
  });

  test("a workspace rule's block still wins over an untrusted ask", () => {
    const d = untrusted(op('sessions.create', 'project.session.start'), [{ match: 'kortix.sessions.create', action: 'block' }]);
    expect(d.action).toBe('block');
    expect(d.source).toBe('project');
  });
});
