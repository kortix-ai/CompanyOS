/**
 * The agent rules on the Kortix API: one decision per operation, allow, ask
 * or block, for every request an agent session makes. The `kortix` connector
 * is a connector like every other, so its rules use the connector rule engine
 * (`connectors/policy.ts`) with the operation id as the action path.
 *
 * Order (first answer wins):
 *   1. exposure `human`: block. An operation for people only.
 *   2. project `policies:` that name `kortix.` (`kortix.secrets.*`).
 *      A pattern that does not name `kortix` (`*`, `*.delete*`) is about the
 *      workspace's other connectors and does not apply here.
 *   3. the agent's policy set on `kortix`; else its `kortix_permissions`
 *      list read as rules: allow a listed action, block every other one.
 *   4. the `kortix` connector's base rules.
 *   5. allow: the IAM role (the ceiling) still decides in the handler.
 *
 * Design: `.agents/skills/learnings/work/kortix-surface/README.md`.
 */
import type { AgentGrant } from '@kortix/db';
import { type Policy, type PolicyAction, resolveEffectiveRule } from '../connectors/policy';
import type { Operation } from '../shared/operation-registry';
import { agentListAllows } from './agent-scope';

export { agentListAllows };

export const KORTIX_CONNECTOR_SLUG = 'kortix';

export type KortixRuleSource = 'exposure' | 'project' | 'policy_set' | 'agent_permissions' | 'connector' | 'default';

export interface KortixRuleDecision {
  action: PolicyAction;
  source: KortixRuleSource;
  /** The rule that decided, when a rule did. */
  rule?: Policy;
}

export interface KortixRuleInput {
  operation: Operation;
  grant: AgentGrant | null;
  /** Every project rule; only those that name `kortix.` apply. */
  projectPolicies: Policy[];
  /** The agent's set on `kortix`: undefined = no set assigned, null = assigned but missing. */
  setPolicies?: Policy[] | null;
  connectorPolicies?: Policy[];
  /** The request's arguments (path parameters, query, JSON body), for rules with conditions. */
  args?: Record<string, unknown> | null;
  argsAvailable?: boolean;
}

/** A project rule about the `kortix` connector: its pattern starts with `kortix.`. */
export function isKortixPolicy(policy: Policy): boolean {
  return policy.match.toLowerCase().startsWith(`${KORTIX_CONNECTOR_SLUG}.`);
}

/** The one decision. Pure. */
export function decideKortixOperation(input: KortixRuleInput): KortixRuleDecision {
  const { operation } = input;
  if (operation.exposure === 'human') return { action: 'block', source: 'exposure' };

  const scoped = (policies: { project?: Policy[]; set?: Policy[] | null; connector?: Policy[] }) =>
    resolveEffectiveRule({
      fullPath: `${KORTIX_CONNECTOR_SLUG}.${operation.id}`,
      relPath: operation.id,
      projectPolicies: policies.project ?? [],
      setPolicies: policies.set ?? undefined,
      setMissing: policies.set === null,
      connectorPolicies: policies.connector ?? [],
      risk: 'read',
      defaultMode: 'allow_all',
      args: input.args ?? null,
      argsAvailable: input.argsAvailable ?? false,
    });

  const first = scoped({ project: input.projectPolicies.filter(isKortixPolicy), set: input.setPolicies });
  if (first.source === 'project' || first.source === 'policy_set') {
    return { action: first.action, source: first.source, ...(first.rule ? { rule: first.rule } : {}) };
  }

  if (input.setPolicies === undefined && input.grant && input.grant.permissions !== 'all') {
    const listed = agentListAllows(input.grant, operation.action);
    return { action: listed ? 'always_run' : 'block', source: 'agent_permissions' };
  }

  const base = scoped({ connector: input.connectorPolicies });
  if (base.source === 'connector') {
    return { action: base.action, source: 'connector', ...(base.rule ? { rule: base.rule } : {}) };
  }
  return { action: 'always_run', source: 'default' };
}
