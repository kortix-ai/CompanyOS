/**
 * The agent rules on the Kortix API: one decision per operation, allow, ask
 * or block, for every request an agent session makes. The `kortix` connector
 * is a connector like every other, so its rules use the connector rule engine
 * (`connectors/policy.ts`) with the operation id as the action path.
 *
 * Order (first answer wins):
 *   1. exposure `human`: block. An operation for people only.
 *   1b. the session is untrusted (shared/session-trust.ts): the untrusted
 *      rules, which no workspace rule can loosen.
 *   1c. a HUMAN_ONLY action (minting a credential, paying, deleting the
 *      workspace): always ask a person. A workspace rule can block it, never
 *      allow it; the approved run passes authorize's HUMAN_ONLY wall.
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
import { isHumanOnlyAction } from '@kortix/shared/workspace-actions';
import { agentListAllows } from './agent-scope';

export { agentListAllows };

export const KORTIX_CONNECTOR_SLUG = 'kortix';

/**
 * What an untrusted session may never do, by IAM action prefix: read or
 * change secrets, credentials, keys, members, IAM or billing. A hijacked
 * session must not reach what would let its author in.
 */
const UNTRUSTED_BLOCKED_PREFIXES = [
  'project.secret.',
  'project.credentials.',
  'project.gateway.keys.',
  'project.members.',
  'member.',
  'token.',
  'iam.',
  'billing.',
  'account.',
] as const;

/**
 * Operations that are the connector gateway itself: the gateway applies the
 * untrusted rules to the connector action inside (a read passes, a write asks),
 * so the call to the gateway has no untrusted answer of its own.
 */
const GATEWAY_OPERATIONS: ReadonlySet<string> = new Set(['connectors.call', 'connectors.session.call']);

/** The untrusted rules: block the sensitive actions, ask before any other write, allow reads. Null: no say. */
export function untrustedDecision(operation: Pick<Operation, 'id' | 'action' | 'method'>): KortixRuleDecision | null {
  if (GATEWAY_OPERATIONS.has(operation.id)) return null;
  if (UNTRUSTED_BLOCKED_PREFIXES.some((prefix) => operation.action.startsWith(prefix))) return { action: 'block', source: 'untrusted' };
  if (operation.method !== 'GET' && operation.method !== 'HEAD') return { action: 'require_approval', source: 'untrusted' };
  return null;
}

export type KortixRuleSource = 'exposure' | 'untrusted' | 'always_ask' | 'project' | 'policy_set' | 'agent_permissions' | 'connector' | 'default';

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
  /** The calling session's trust; absent = principal. */
  trust?: 'principal' | 'untrusted';
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
  const workspace = workspaceRules(input);
  // The guards below only tighten: a block from the workspace's own rules wins over their ask.
  if (input.trust === 'untrusted') {
    const untrusted = untrustedDecision(operation);
    if (untrusted?.action === 'block') return untrusted;
    if (untrusted) return workspace.action === 'block' ? workspace : untrusted;
  }
  if (isHumanOnlyAction(operation.action)) {
    return workspace.action === 'block' ? workspace : { action: 'require_approval', source: 'always_ask' };
  }
  return workspace;
}

/** The workspace's own rules: project rules, the agent's set or list, the base rules, else allow. */
function workspaceRules(input: KortixRuleInput): KortixRuleDecision {
  const { operation } = input;
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
